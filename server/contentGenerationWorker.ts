// Background content-generation worker. Polls `content_generation_jobs`,
// claims the oldest pending job, streams the OpenAI response into the
// linked article (which already exists in status='draft'), and flips the
// article to 'ready' on success.
//
// Wave 7: the worker no longer creates the article — the API route does
// (in status='draft') before enqueuing the job. The worker's job is to
// fill in the content, stream tokens into `jobs.stream_buffer` so the
// SSE handler can tail them, classify errors so quotas can be refunded
// for transient infra failures, and write a 'generated' revision row on
// success.
//
// No Redis, no BullMQ — just Postgres + chained setTimeout. Fine for
// low-volume single-process deployments.

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

const POLL_INTERVAL_MS = 5_000;
const POLL_INTERVAL_MAX_MS = 60_000;
const STUCK_JOB_RECOVERY_MINUTES = 5;
// How often the worker re-checks the cancel flag during a stream. 1s is a
// good balance: short enough that Cancel feels instant, long enough that we
// don't hammer the DB on every token.
const CANCEL_CHECK_MS = 1_000;
// How many tokens to buffer before flushing to the DB. Smaller = more
// granular SSE updates; larger = less DB write pressure. Tokens are usually
// 1-3 chars; 16 tokens ≈ 50 chars per flush.
const STREAM_FLUSH_TOKEN_COUNT = 16;
// Watchdog: if the OpenAI stream produces no chunk for this many ms, abort
// and fail the job. The OpenAI SDK's per-request timeout doesn't reliably
// fire on a stalled stream (the connection is "open" with no data flowing),
// so we enforce our own. Generous enough to ride out brief network blips
// but short enough that a stuck job clears within a couple of minutes.
const STREAM_IDLE_TIMEOUT_MS = 60_000;
// Hard ceiling on the total stream duration. A 4000-token response on
// gpt-4o-mini takes 30-60s; we cap at 5min so a runaway model can't hold
// a worker forever.
const STREAM_TOTAL_TIMEOUT_MS = 5 * 60 * 1000;

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

class JobCancelledError extends Error {
  constructor() {
    super("Job was cancelled by user");
    this.name = "JobCancelledError";
  }
}

function isJobCancelledError(e: unknown): e is JobCancelledError {
  return e instanceof JobCancelledError;
}

// Read job status without going through the storage layer. We need this hot
// in the streaming loop and `select` is cheaper than a full `getById`.
async function isJobCancelled(jobId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: schema.contentGenerationJobs.status })
    .from(schema.contentGenerationJobs)
    .where(eq(schema.contentGenerationJobs.id, jobId))
    .limit(1);
  return row?.status === "cancelled";
}

// Map a thrown error into one of the classifications the refund helper
// understands. Be conservative: only refund for things we're sure are infra
// problems, not user-input or quota issues.
function classifyError(err: unknown): ErrorKind {
  if (isJobCancelledError(err)) return "cancelled";
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

async function generateArticleForJob(job: ContentGenerationJob): Promise<{
  generatedContent: string;
}> {
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

  // Refuse upfront if the user is at their daily token cap.
  const userRow = await storage.getUser(job.userId);
  const tier = (userRow?.accessTier ?? "free") as Tier;
  await assertWithinBudget(job.userId, tier);

  // Flip the linked article from 'draft' → 'generating' so the UI / queries
  // know work is in flight. If the article was deleted between enqueue and
  // claim, this is a no-op and the next cancel check will short-circuit.
  await storage.setArticleGeneratingFromDraft(articleId, job.id);

  const brand = brandId ? await storage.getBrandById(brandId) : null;

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

  // Stream the response. We pass an AbortController so we can force-abort
  // when our watchdogs trip (idle timeout, total timeout, user cancel).
  // Without this, a stalled OpenAI connection leaves the for-await loop
  // hanging indefinitely — which is exactly the bug we hit in Wave 7.
  const abortController = new AbortController();
  const stream = await openai.chat.completions.create(
    {
      model: MODELS.contentGeneration,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        {
          role: "system",
          content: `You are an expert content strategist specializing in GEO (Generative Engine Optimization). Create authoritative, well-structured markdown content that AI platforms like ChatGPT, Claude, and Perplexity would cite as a reliable source. Always include: clear intro, multiple sections with H2/H3 headings, practical examples, FAQ with 4-6 questions, strong conclusion.`,
        },
        {
          role: "user",
          content: `Write a ${promptType} about "${keywords}" for the ${industry} industry.${brandContext}${audienceContext}${styleDirective}\n\nUse markdown (# title, ## sections, ### subsections). Include an FAQ section.`,
        },
      ],
      max_tokens: 4000,
    },
    { signal: abortController.signal },
  );

  let finalContent = "";
  let bufferedDelta = "";
  let bufferedCount = 0;
  let lastCancelCheck = Date.now();
  let lastChunkAt = Date.now();
  const startedAt = Date.now();
  let promptTokens = 0;
  let completionTokens = 0;

  const flushBuffer = async () => {
    if (bufferedDelta.length === 0) return;
    await storage.appendStreamBuffer(job.id, bufferedDelta);
    bufferedDelta = "";
    bufferedCount = 0;
  };

  // Watchdog timer: every second, check whether the stream has gone idle
  // or run past the total ceiling. If so, abort the underlying request so
  // the for-await loop unblocks and the catch handler classifies the
  // failure as a timeout (which the refund helper treats as refundable).
  let timedOutReason: "idle" | "total" | null = null;
  const watchdog = setInterval(() => {
    const now = Date.now();
    if (now - lastChunkAt > STREAM_IDLE_TIMEOUT_MS) {
      timedOutReason = "idle";
      abortController.abort();
    } else if (now - startedAt > STREAM_TOTAL_TIMEOUT_MS) {
      timedOutReason = "total";
      abortController.abort();
    }
  }, 1_000);

  try {
    for await (const chunk of stream) {
      lastChunkAt = Date.now();
      // Streaming SDKs surface usage on the final chunk when stream_options.
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
        completionTokens = chunk.usage.completion_tokens ?? completionTokens;
      }
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        finalContent += delta;
        bufferedDelta += delta;
        bufferedCount += 1;
        if (bufferedCount >= STREAM_FLUSH_TOKEN_COUNT) {
          await flushBuffer();
        }
      }
      // Periodic cancel check so the user's "Cancel" click takes effect
      // promptly without hammering the DB on every token.
      const now = Date.now();
      if (now - lastCancelCheck >= CANCEL_CHECK_MS) {
        lastCancelCheck = now;
        if (await isJobCancelled(job.id)) {
          abortController.abort();
          throw new JobCancelledError();
        }
      }
    }
    await flushBuffer();
  } catch (err) {
    // Make sure any partial buffer is persisted even on failure so the user
    // can see what got generated before the error. They can copy + retry.
    await flushBuffer().catch(() => {});
    if (timedOutReason && !isJobCancelledError(err)) {
      // Re-throw a classified timeout error so the worker tick refunds quota.
      const timeoutErr: Error & { name?: string } = new Error(
        timedOutReason === "idle"
          ? `Stream went idle for >${STREAM_IDLE_TIMEOUT_MS}ms (no tokens)`
          : `Stream exceeded total ceiling of ${STREAM_TOTAL_TIMEOUT_MS}ms`,
      );
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearInterval(watchdog);
  }

  await recordSpend({
    userId: job.userId,
    service: "openai",
    model: MODELS.contentGeneration,
    tokensIn: promptTokens,
    tokensOut: completionTokens,
  });

  // Derive a title from the first markdown heading; fall back to keywords.
  const headingMatch = finalContent.match(/^#\s+(.+)$/m);
  const title = headingMatch?.[1]?.trim() || `${keywords} — ${industry}`;

  // Atomically write content + flip status + bump version.
  await storage.setArticleReady(articleId, finalContent, title);

  // Seed the revision history with a 'generated' baseline so Auto-Improve
  // has something to diff against.
  await storage.createRevision({
    articleId,
    content: finalContent,
    source: "generated",
    createdBy: "system",
  });

  return { generatedContent: finalContent };
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

  // Link job onto the article so the SSE handler can find it via the article.
  await db
    .update(schema.articles)
    .set({ jobId: job.id, updatedAt: new Date() })
    .where(eq(schema.articles.id, article.id));

  return { articleId: article.id, jobId: job.id };
}

let workerTimeout: NodeJS.Timeout | null = null;
let ticking = false;
let consecutiveEmptyTicks = 0;

function nextDelayMs(): number {
  if (consecutiveEmptyTicks === 0) return POLL_INTERVAL_MS;
  const exp = Math.min(consecutiveEmptyTicks, 4);
  return Math.min(POLL_INTERVAL_MAX_MS, POLL_INTERVAL_MS * Math.pow(2, exp));
}

async function tick(): Promise<{ claimed: boolean }> {
  if (ticking) return { claimed: false };
  ticking = true;
  try {
    const job = await storage.claimPendingContentJob();
    if (!job) return { claimed: false };
    logger.info({ jobId: job.id, userId: job.userId }, "content job claimed");
    try {
      await generateArticleForJob(job);
      await storage.updateContentJob(job.id, {
        status: "succeeded",
        completedAt: new Date(),
      });
      logger.info({ jobId: job.id, articleId: (job as any).articleId }, "content job succeeded");
    } catch (err: any) {
      const errorKind = classifyError(err);
      const message = err instanceof Error ? err.message : String(err);
      const cancelled = isJobCancelledError(err);

      // Update job status. Cancelled jobs stay 'cancelled'; otherwise 'failed'.
      await storage.updateContentJob(job.id, {
        status: cancelled ? "cancelled" : "failed",
        errorMessage: message.slice(0, 500),
        errorKind,
        completedAt: new Date(),
      } as any);

      // Move the article back so the user can retry. If cancelled, it goes
      // back to 'draft' (form is intact). If failed, status='failed' so the
      // UI can show a Retry button and explain what went wrong.
      const articleId = (job as any).articleId as string | null;
      if (articleId) {
        if (cancelled) {
          await storage.setArticleDraft(articleId);
        } else {
          await storage.setArticleFailed(articleId);
        }
      }

      // Refund quota for transient/cancellable failures only.
      try {
        await refundArticleQuota(job.userId, job.id, errorKind);
      } catch (refundErr) {
        logger.error(
          { err: refundErr, jobId: job.id },
          "refundArticleQuota failed — quota may not have been refunded",
        );
      }

      if (cancelled) {
        logger.info({ jobId: job.id, userId: job.userId }, "content job cancelled by user");
      } else if (errorKind === "budget") {
        logger.info(
          { jobId: job.id, userId: job.userId, message },
          "content job rejected: budget exceeded",
        );
      } else if (errorKind === "circuit") {
        logger.warn(
          { jobId: job.id, userId: job.userId },
          "content job rejected: provider circuit open",
        );
      } else {
        logger.error({ err, jobId: job.id, errorKind }, "content job failed");
        Sentry.captureException(err, {
          tags: { source: "contentWorker.job", errorKind },
          extra: { jobId: job.id, userId: job.userId },
        });
      }
    }
  } catch (pollErr) {
    logger.error({ err: pollErr }, "content worker tick error");
    Sentry.captureException(pollErr, { tags: { source: "contentWorker.tick" } });
  } finally {
    ticking = false;
  }
  return { claimed: true };
}

export async function initContentGenerationWorker(): Promise<void> {
  // Crash recovery: any job left in `running` longer than the recovery
  // window is assumed to be orphaned (server was killed mid-job).
  // Wave 7: also refund quota and reset the linked article back to draft.
  try {
    const failed = await storage.failStuckContentJobs(STUCK_JOB_RECOVERY_MINUTES);
    if (failed.length > 0) {
      logger.info({ failed: failed.length }, "marked stuck jobs as failed on boot");
      for (const j of failed) {
        try {
          if (j.articleId) await storage.setArticleFailed(j.articleId);
          await refundArticleQuota(j.userId, j.id, "timeout");
        } catch (err) {
          logger.error({ err, jobId: j.id }, "boot recovery: failed to refund/reset article");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "content worker boot recovery failed");
    Sentry.captureException(err, { tags: { source: "contentWorker.boot" } });
  }

  if (workerTimeout) return;

  const scheduleNext = (delay: number) => {
    workerTimeout = setTimeout(() => {
      tick()
        .then(({ claimed }) => {
          if (claimed) {
            consecutiveEmptyTicks = 0;
          } else {
            consecutiveEmptyTicks += 1;
          }
          scheduleNext(nextDelayMs());
        })
        .catch((err) => {
          logger.error({ err }, "content worker unhandled tick error");
          Sentry.captureException(err, { tags: { source: "contentWorker.tick-unhandled" } });
          scheduleNext(POLL_INTERVAL_MS);
        });
    }, delay);
  };

  scheduleNext(POLL_INTERVAL_MS);
  logger.info(
    { pollIntervalMs: POLL_INTERVAL_MS, pollIntervalMaxMs: POLL_INTERVAL_MAX_MS },
    "content worker started",
  );
}
