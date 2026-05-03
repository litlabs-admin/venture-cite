// Content-generation slice runner.
//
// Vercel migration / Wave 9.5: the prior Chat Completions streaming
// worker was replaced by runArticleSlice(jobId, deadline), invoked by:
//   - POST /api/content-jobs/:jobId/advance — user-driven, ~8s budget
//   - the daily cron orchestrator's drain step — server-driven, longer
//     budget
//
// First call kicks off an OpenAI Responses run with `background: true,
// store: true` — the work runs on OpenAI's infrastructure, decoupled
// from our 60s function ceiling. The response_id is persisted on the
// job. Subsequent /advance calls poll openai.responses.retrieve() and
// finalize the article when status="completed". Single LLM call per
// article; no continuation prompts, no token streaming, no seams.

import OpenAI from "openai";
import { storage } from "./storage";
import { db } from "./db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";
import { attachAiLogger } from "./lib/aiLogger";
import { MODELS } from "./lib/modelConfig";
import { logger } from "./lib/logger";
import { Sentry } from "./instrument";
import { assertWithinBudget, recordSpend, isBudgetExceededError, type Tier } from "./lib/llmBudget";
import { openaiBreaker, isCircuitOpenError } from "./lib/circuitBreaker";
import { refundArticleQuota, type ErrorKind } from "./lib/usageLimit";
import type { ContentGenerationJob } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120_000, // streaming runs longer than non-streaming
  maxRetries: 1,
});
attachAiLogger(openai);

export type GenerationPayload = {
  keywords: string;
  industry: string;
  type: string;
  brandId?: string;
  articleId: string; // Wave 7: required — the draft article the job will fill
  targetCustomers?: string;
  geography?: string;
  contentStyle?: "b2b" | "b2c";
};

// Map a thrown error into one of the classifications the refund helper
// understands. Be conservative: only refund for things we're sure are infra
// problems, not user-input or quota issues.
function classifyError(err: unknown): ErrorKind {
  if (isBudgetExceededError(err)) return "budget";
  if (isCircuitOpenError(err)) return "circuit";
  const e = err as { status?: number; code?: string; name?: string } | undefined;
  if (e?.status === 429) return "openai_429";
  if (typeof e?.status === "number" && e.status >= 500 && e.status < 600) return "openai_5xx";
  if (e?.name === "AbortError" || e?.name === "TimeoutError" || e?.code === "ETIMEDOUT") {
    return "timeout";
  }
  return "unknown";
}

type SliceResult =
  | { kind: "completed"; finalContent: string }
  | { kind: "deadline"; partialContent: string }
  | { kind: "cancelled" };

async function runJobToCompletionOrDeadline(
  job: ContentGenerationJob,
  _executionDeadline: number,
): Promise<SliceResult> {
  const payload = job.requestPayload as unknown as GenerationPayload;
  const {
    keywords,
    industry,
    type,
    brandId,
    articleId,
    targetCustomers,
    geography,
    contentStyle = "b2c",
  } = payload;

  if (!articleId) {
    throw new Error("Job is missing articleId — cannot fill draft");
  }

  // Legacy job migration: pre-Responses code wrote partial tokens to
  // stream_buffer. Those jobs cannot be cleanly resumed with the new
  // model — the original Chat Completions stream is gone, and the only
  // way forward is to fail the job so the user retries. We mark the
  // error with name="TimeoutError" so classifyError() returns "timeout",
  // which refundArticleQuota treats as refundable (the failure is on
  // our infra side, not the user's prompt).
  const existingBuffer = (job.streamBuffer ?? "") as string;
  const existingResponseId = (job as unknown as { openaiResponseId: string | null })
    .openaiResponseId;
  if (!existingResponseId && existingBuffer.length > 0) {
    const err: Error & { name?: string } = new Error(
      "legacy in-flight job from a prior deploy — please retry generation",
    );
    err.name = "TimeoutError";
    throw err;
  }

  const userRow = await storage.getUser(job.userId);
  const tier = (userRow?.accessTier ?? "free") as Tier;
  await assertWithinBudget(job.userId, tier);

  // Flip the article into 'generating' on the first call. Idempotent.
  await storage.setArticleGeneratingFromDraft(articleId, job.id);

  // First /advance call: kick off the OpenAI Responses run. Returns
  // immediately; the actual work runs on OpenAI's servers.
  if (!existingResponseId) {
    const brand = brandId ? ((await storage.getBrandById(brandId)) ?? null) : null;
    const promptText = buildContentPrompt({
      keywords,
      industry,
      type,
      brand: brand as Parameters<typeof buildContentPrompt>[0]["brand"],
      targetCustomers,
      geography,
      contentStyle,
    });

    const response = await openaiBreaker.run(() =>
      openai.responses.create({
        model: MODELS.contentGeneration as string,
        input: promptText,
        background: true,
        store: true,
      }),
    );

    await storage.updateContentJobResponseId(job.id, response.id);

    return { kind: "deadline", partialContent: "" };
  }

  // Subsequent /advance calls: poll OpenAI for completion.
  const response = await openaiBreaker.run(() => openai.responses.retrieve(existingResponseId));

  if (response.status === "completed") {
    const finalContent = extractResponseText(response as Parameters<typeof extractResponseText>[0]);
    if (!finalContent) {
      // Refundable — empty output is a model anomaly, not user input.
      const err: Error & { name?: string } = new Error(
        "OpenAI Responses run completed with empty output",
      );
      err.name = "TimeoutError";
      throw err;
    }

    if (response.usage) {
      await recordSpend({
        userId: job.userId,
        service: "openai",
        model: MODELS.contentGeneration,
        tokensIn: response.usage.input_tokens ?? 0,
        tokensOut: response.usage.output_tokens ?? 0,
      });
    }

    const headingMatch = finalContent.match(/^#\s+(.+)$/m);
    const title = headingMatch?.[1]?.trim() || `${keywords} — ${industry}`;
    await storage.setArticleReady(articleId, finalContent, title);
    await storage.createRevision({
      articleId,
      content: finalContent,
      source: "generated",
      createdBy: "system",
    });
    return { kind: "completed", finalContent };
  }

  if (response.status === "failed") {
    // OpenAI-side failure → refundable (treat as timeout in classifyError
    // so the user gets their quota back and can retry).
    const message = response.error?.message ?? "OpenAI Responses run failed";
    const err: Error & { name?: string } = new Error(message);
    err.name = "TimeoutError";
    throw err;
  }

  if (response.status === "cancelled") {
    return { kind: "cancelled" };
  }

  if (response.status === "incomplete") {
    // Incomplete means the run was truncated (e.g. max_output_tokens
    // hit). Refundable — user should retry with adjusted scope.
    const reason = response.incomplete_details?.reason ?? "incomplete";
    const err: Error & { name?: string } = new Error(`OpenAI Responses run incomplete: ${reason}`);
    err.name = "TimeoutError";
    throw err;
  }

  // queued | in_progress — still running, return deadline-style outcome
  // so the caller treats this slice as "more work to do."
  return { kind: "deadline", partialContent: "" };
}

// Build the user prompt text from the job's request payload.
function buildContentPrompt(args: {
  keywords: string;
  industry: string;
  type: string;
  brand: {
    companyName: string | null;
    name: string | null;
    industry: string | null;
    description: string | null;
    tone: string | null;
    targetAudience: string | null;
    products: string[] | null;
    uniqueSellingPoints: string[] | null;
  } | null;
  targetCustomers?: string;
  geography?: string;
  contentStyle: "b2b" | "b2c";
}): string {
  const { keywords, industry, type, brand, targetCustomers, geography, contentStyle } = args;

  const contentTypePrompts: Record<string, string> = {
    Article: "comprehensive article (1500-2000 words)",
    "Blog Post": "in-depth blog post (1200-1500 words)",
    "Product Description": "detailed product guide (800-1000 words)",
    "Social Media Post": "engaging social media content series (500-700 words total)",
  };
  const promptType = contentTypePrompts[type] || "comprehensive content (1500+ words)";

  let brandContext = "";
  if (brand) {
    brandContext = `\n\nBRAND INFO:\n- Company: ${brand.companyName}\n- Brand: ${brand.name}\n- Industry: ${brand.industry}${brand.description ? `\n- Description: ${brand.description}` : ""}${brand.tone ? `\n- Tone: ${brand.tone}` : ""}${brand.targetAudience ? `\n- Audience: ${brand.targetAudience}` : ""}${brand.products?.length ? `\n- Products: ${brand.products.join(", ")}` : ""}${brand.uniqueSellingPoints?.length ? `\n- USPs: ${brand.uniqueSellingPoints.join(", ")}` : ""}\n\nIncorporate the brand's identity naturally.`;
  }

  let audienceContext = "";
  if (targetCustomers || geography) {
    audienceContext = `\n\nTARGET AUDIENCE:${targetCustomers ? `\n- Customers: ${targetCustomers}` : ""}${geography ? `\n- Geography: ${geography}` : ""}`;
  }

  const isB2C = contentStyle === "b2c";
  const styleDirective = isB2C
    ? `\n\nSTYLE: B2C — warm, conversational, benefit-first, second-person, lifestyle framing. No jargon.`
    : `\n\nSTYLE: B2B — professional, data-driven, ROI-focused, industry terminology, business impact framing.`;

  const systemPreamble = `You are an expert content strategist specializing in GEO (Generative Engine Optimization). Create authoritative, well-structured markdown content that AI platforms like ChatGPT, Claude, and Perplexity would cite as a reliable source. Always include: clear intro, multiple sections with H2/H3 headings, practical examples, FAQ with 4-6 questions, strong conclusion.\n\n`;
  const userPart = `Write a ${promptType} about "${keywords}" for the ${industry} industry.${brandContext}${audienceContext}${styleDirective}\n\nUse markdown (# title, ## sections, ### subsections). Include an FAQ section.`;
  return `${systemPreamble}${userPart}`;
}

// Extract markdown text from a Responses API result. The SDK exposes
// output_text as a convenience; fall back to walking output[].content[]
// if the convenience field is absent (e.g. older SDK or mocks).
function extractResponseText(response: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (typeof response.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }
  const segments: string[] = [];
  for (const item of response.output ?? []) {
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && typeof c.text === "string") {
        segments.push(c.text);
      }
    }
  }
  return segments.join("");
}

// Public entry: run one slice of work for a job, bounded by deadlineMs.
// Returns the resulting state. Caller (route or cron) decides whether to
// loop again. Wraps runJobToCompletionOrDeadline with the
// success/failure/refund bookkeeping that previously lived in tick().
export type SliceOutcome =
  | { done: true; status: "succeeded" }
  | { done: true; status: "failed" | "cancelled"; errorKind?: ErrorKind; message?: string }
  | { done: false; status: "running" };

export async function runArticleSlice(jobId: string, deadlineMs: number): Promise<SliceOutcome> {
  const job = await storage.getContentJobByIdAdmin(jobId);
  if (!job) {
    return {
      done: true,
      status: "failed",
      errorKind: "unknown",
      message: "Job not found",
    };
  }
  if (job.status !== "pending" && job.status !== "running") {
    return {
      done: true,
      status: job.status === "succeeded" ? "succeeded" : (job.status as "failed" | "cancelled"),
    };
  }

  if (job.status === "pending") {
    await storage.updateContentJob(job.id, {
      status: "running",
      startedAt: new Date(),
    });
  }

  let result: SliceResult;
  try {
    result = await runJobToCompletionOrDeadline(job, deadlineMs);
  } catch (err) {
    const errorKind = classifyError(err);
    const message = err instanceof Error ? err.message : String(err);
    await storage.updateContentJob(job.id, {
      status: "failed",
      errorMessage: message.slice(0, 500),
      errorKind,
      completedAt: new Date(),
    } as never);
    if (job.articleId) {
      try {
        await storage.setArticleFailed(job.articleId);
      } catch {
        // best-effort
      }
    }
    try {
      await refundArticleQuota(job.userId, job.id, errorKind);
    } catch {
      // logged separately; never throw out
    }
    if (errorKind === "budget") {
      logger.info({ jobId: job.id, userId: job.userId, message }, "content slice rejected: budget");
    } else if (errorKind === "circuit") {
      logger.warn(
        { jobId: job.id, userId: job.userId },
        "content slice rejected: provider circuit open",
      );
    } else {
      logger.error({ err, jobId: job.id, errorKind }, "content slice failed");
      Sentry.captureException(err, {
        tags: { source: "contentSlice", errorKind },
        extra: { jobId: job.id, userId: job.userId },
      });
    }
    return {
      done: true,
      status: "failed",
      errorKind,
      message: message.slice(0, 500),
    };
  }

  if (result.kind === "completed") {
    await storage.updateContentJob(job.id, {
      status: "succeeded",
      completedAt: new Date(),
    });
    logger.info({ jobId: job.id }, "content slice completed");
    return { done: true, status: "succeeded" };
  }
  if (result.kind === "cancelled") {
    if (job.articleId) {
      try {
        await storage.setArticleDraft(job.articleId);
      } catch {
        // best-effort
      }
    }
    await storage.updateContentJob(job.id, {
      status: "cancelled",
      completedAt: new Date(),
    });
    return { done: true, status: "cancelled" };
  }

  // Deadline hit — leave job in 'running'; next /advance resumes.
  return { done: false, status: "running" };
}

// Programmatic enqueue used by the agent task executor (the autonomous
// Win-a-Prompt + content-generation workflows). The HTTP route at
// POST /api/articles/:id/generate is the user-facing entry point; this
// helper does the same atomic create-draft + enqueue but skips the request
// validation since callers are server-side.
//
// Returns { articleId, jobId }. The article is left in status='draft' until
// the worker claims the job and flips it (same flow as the HTTP route).
export async function enqueueContentGenerationJob(
  userId: string,
  brandId: string,
  payload: Omit<GenerationPayload, "articleId">,
): Promise<{ articleId: string; jobId: string }> {
  // Create the draft article first so the job has something to fill.
  const article = await storage.createDraftArticle(userId, brandId, {
    keywords: payload.keywords
      ? payload.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : null,
    industry: payload.industry ?? null,
    contentType: payload.type ?? "article",
    targetCustomers: payload.targetCustomers ?? null,
    geography: payload.geography ?? null,
    contentStyle: payload.contentStyle ?? "b2c",
  });

  const job = await storage.enqueueContentJob({
    userId,
    brandId,
    articleId: article.id,
    status: "pending",
    requestPayload: { ...payload, articleId: article.id, brandId } as never,
  } as schema.InsertContentGenerationJob);

  // Link the job onto the article so the client polling code can find
  // the current job_id from articles.job_id without a separate lookup.
  await db
    .update(schema.articles)
    .set({ jobId: job.id, updatedAt: new Date() })
    .where(eq(schema.articles.id, article.id));

  return { articleId: article.id, jobId: job.id };
}

// Vercel migration: the polling worker (initContentGenerationWorker, tick,
// nextDelayMs) and the older generateArticleForJob entry were removed.
// The /api/content-jobs/:jobId/advance route and the daily cron's drain
// step are the only callers of runArticleSlice; both wrap the slice with
// the per-job lock (last_advance_started_at) so concurrent calls don't
// double-stream into the same buffer.
