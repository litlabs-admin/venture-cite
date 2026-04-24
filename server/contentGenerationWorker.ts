// Background content-generation worker. Polls the `content_generation_jobs`
// table every few seconds, claims the oldest pending job, runs the existing
// prompt + humanization pipeline, and persists the result as a draft
// article. Because persistence happens server-side, generations survive
// page navigation, logout, browser refresh, and device switches.
//
// No Redis, no BullMQ — just Postgres + setInterval. Fine for low-volume
// single-process deployments.

import OpenAI from "openai";
import { storage } from "./storage";
import { attachAiLogger } from "./lib/aiLogger";
import { MODELS } from "./lib/modelConfig";
import { logger } from "./lib/logger";
import { Sentry } from "./instrument";
import { assertWithinBudget, recordSpend, isBudgetExceededError, type Tier } from "./lib/llmBudget";
import { openaiBreaker, isCircuitOpenError } from "./lib/circuitBreaker";
import type { ContentGenerationJob, InsertContentGenerationJob } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

const POLL_INTERVAL_MS = 5_000;
const POLL_INTERVAL_MAX_MS = 60_000;
const STUCK_JOB_RECOVERY_MINUTES = 10;

export type GenerationPayload = {
  keywords: string;
  industry: string;
  type: string;
  brandId?: string;
  humanize?: boolean;
  targetCustomers?: string;
  geography?: string;
  contentStyle?: "b2b" | "b2c";
};

function safeParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  const candidate = match ? match[0] : stripped;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

async function humanizeContent(
  content: string,
  industry: string,
  userId: string,
  maxAttempts = 3,
  baselineScore?: number, // rewrites must beat this to replace the content
): Promise<{
  humanizedContent: string;
  humanScore: number;
  attempts: number;
  issues: string[];
  strengths: string[];
}> {
  let currentContent = content;
  let humanScore = 0;
  let attempts = 0;
  let issues: string[] = [];
  let strengths: string[] = [];
  // Start bestContent as the original and bestScore as the baseline (or 0 for
  // first-time generation). A rewrite is only kept when it strictly beats the
  // best seen so far — this prevents auto-improve from returning worse content.
  let bestContent = content;
  let bestScore = baselineScore ?? 0;
  let bestIssues: string[] = [];
  let bestStrengths: string[] = [];

  const inputTokens = Math.ceil(content.length / 3.5);
  const perCallMaxTokens = Math.min(4500, Math.max(500, Math.ceil(inputTokens * 1.5)));

  const passes = [
    `You are a seasoned ${industry} journalist. Rewrite AI-sounding text so it reads as if a human wrote it: vary sentence lengths aggressively, use contractions, drop first-person observations, avoid AI clichés ("landscape", "leverage", "delve", "crucial", "comprehensive", "In today's...", "In conclusion"). Return ONLY the rewritten markdown content.`,
    `You are a meticulous copy editor. Replace any remaining AI-sounding phrases with natural alternatives, ensure contractions, vary sentence starts, and break any monotonous rhythm. Return ONLY improved markdown content.`,
    `Final pass: flag anything that sounds "written by committee" and make it sound like one person talking. Ensure varied sentence structure, no AI clichés, and end on a forward-looking thought. Return ONLY the final markdown content.`,
  ];

  for (let i = 0; i < Math.min(maxAttempts, passes.length); i += 1) {
    attempts += 1;
    const rewrite = await openaiBreaker.run(() =>
      openai.chat.completions.create({
        model: MODELS.contentHumanize,
        messages: [
          { role: "system", content: passes[i] },
          {
            role: "user",
            content: `Rewrite this to sound naturally human, keeping all info + markdown:\n\n${currentContent}`,
          },
        ],
        max_tokens: perCallMaxTokens,
        temperature: 1.0,
      }),
    );
    currentContent = rewrite.choices[0].message.content || currentContent;
    await recordSpend({
      userId,
      service: "openai",
      model: MODELS.contentHumanize,
      tokensIn: rewrite.usage?.prompt_tokens ?? 0,
      tokensOut: rewrite.usage?.completion_tokens ?? 0,
    });

    const analysis = await openaiBreaker.run(() =>
      openai.chat.completions.create({
        model: MODELS.contentAnalyze,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Strict AI-detection analyst. Return JSON {"score": 0-100, "issues": [...max 5], "strengths": [...max 5]}. Be harsh — most AI-rewritten text scores 40-65.`,
          },
          { role: "user", content: `Analyze strictly:\n\n${currentContent.substring(0, 4000)}` },
        ],
        max_tokens: 600,
        temperature: 0.3,
      }),
    );
    await recordSpend({
      userId,
      service: "openai",
      model: MODELS.contentAnalyze,
      tokensIn: analysis.usage?.prompt_tokens ?? 0,
      tokensOut: analysis.usage?.completion_tokens ?? 0,
    });

    const parsed = safeParseJson<{ score?: number; issues?: string[]; strengths?: string[] }>(
      analysis.choices[0].message.content,
    ) ?? { score: 40 };
    humanScore = typeof parsed.score === "number" ? parsed.score : 40;
    issues = Array.isArray(parsed.issues) ? parsed.issues : [];
    strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];

    if (humanScore > bestScore) {
      bestScore = humanScore;
      bestContent = currentContent;
      bestIssues = [...issues];
      bestStrengths = [...strengths];
    }
    if (humanScore >= 80) break;
  }

  return {
    humanizedContent: bestContent,
    humanScore: bestScore,
    attempts,
    issues: bestIssues,
    strengths: bestStrengths,
  };
}

async function generateArticleForJob(job: ContentGenerationJob): Promise<{
  articleId: string;
  humanScore: number;
  passesAiDetection: boolean;
  generatedContent: string;
}> {
  const payload = job.requestPayload as unknown as GenerationPayload;
  const {
    keywords,
    industry,
    type,
    brandId,
    humanize = true,
    targetCustomers,
    geography,
    contentStyle = "b2c",
  } = payload;

  // Wave 3.2: refuse the job upfront if the user is at their daily token
  // cap. Cheaper than letting the job consume tokens to discover it's over.
  const userRow = await storage.getUser(job.userId);
  const tier = (userRow?.accessTier ?? "free") as Tier;
  await assertWithinBudget(job.userId, tier);

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

  const response = await openaiBreaker.run(() =>
    openai.chat.completions.create({
      model: MODELS.contentGeneration,
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
    }),
  );
  await recordSpend({
    userId: job.userId,
    service: "openai",
    model: MODELS.contentGeneration,
    tokensIn: response.usage?.prompt_tokens ?? 0,
    tokensOut: response.usage?.completion_tokens ?? 0,
  });

  let finalContent = response.choices[0].message.content || "";
  let humanScore = 0;
  let humanizationAttempts = 0;

  if (humanize && finalContent) {
    const result = await humanizeContent(finalContent, industry, job.userId, 3);
    finalContent = result.humanizedContent;
    humanScore = result.humanScore;
    humanizationAttempts = result.attempts;
  }

  // Derive a title from the first markdown heading, or fall back to keywords.
  const headingMatch = finalContent.match(/^#\s+(.+)$/m);
  const title = headingMatch?.[1]?.trim() || `${keywords} — ${industry}`;
  const slug = `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)}-${Date.now().toString(36)}`;

  const article = await storage.createArticle({
    brandId: brandId || null,
    title,
    slug,
    content: finalContent,
    industry,
    contentType: type,
    keywords: keywords
      ? keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : [],
    author: "GEO Platform",
    seoData: {
      humanScore,
      humanizationAttempts,
      passesAiDetection: humanScore >= 70,
      generatedVia: "background-worker",
    },
  } as any);

  // Wave 4.2: usage is now incremented atomically at enqueue time
  // (server/lib/usageLimit.ts:withArticleQuota). Don't double-count it
  // here. Trade-off: failed jobs still consume quota — acceptable for
  // the cap-correctness gain.

  return {
    articleId: article.id,
    humanScore,
    passesAiDetection: humanScore >= 70,
    generatedContent: finalContent,
  };
}

let workerTimeout: NodeJS.Timeout | null = null;

// Re-entry guard. The chained-setTimeout scheduler below already ensures
// the next tick fires only after the previous resolves, but the guard is
// a belt-and-braces against an init-twice bug that double-arms the timer.
let ticking = false;

// Wave 3.4: when a tick claims no job, back off exponentially up to
// POLL_INTERVAL_MAX_MS. Reset to base whenever a job IS claimed. This
// turns an idle worker from "5 SELECT FOR UPDATE per second" into
// "1 every 60s" without sacrificing latency when work arrives.
let consecutiveEmptyTicks = 0;

function nextDelayMs(): number {
  if (consecutiveEmptyTicks === 0) return POLL_INTERVAL_MS;
  // 5s, 10s, 20s, 40s, 60s, 60s, …
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
      const { articleId, humanScore, passesAiDetection, generatedContent } =
        await generateArticleForJob(job);
      await storage.updateContentJob(job.id, {
        status: "succeeded",
        articleId,
        completedAt: new Date(),
      });
      logger.info({ jobId: job.id, articleId }, "content job succeeded");

      // Update the linked draft (if any) with the finished article so the
      // content page can restore state without fetching the job separately.
      try {
        const draft = await storage.getContentDraftByJobId(job.id, job.userId);
        if (draft) {
          await storage.updateContentDraft(draft.id, job.userId, {
            generatedContent,
            articleId,
            jobId: null, // job is done — clear the pointer
            humanScore: humanScore ?? null,
            passesAiDetection: passesAiDetection ? 1 : 0,
          });
        }
      } catch (draftErr) {
        logger.warn({ err: draftErr, jobId: job.id }, "could not update draft for job");
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      await storage.updateContentJob(job.id, {
        status: "failed",
        errorMessage: message.slice(0, 500),
        completedAt: new Date(),
      });
      // Clear the jobId on the draft so the UI stops polling
      try {
        const draft = await storage.getContentDraftByJobId(job.id, job.userId);
        if (draft) await storage.updateContentDraft(draft.id, job.userId, { jobId: null });
      } catch {}
      // Budget-exceeded and circuit-open are both expected operational
      // outcomes (user hit cap / provider outage), not crashes. Log them
      // as info/warn and don't page Sentry — that's noise.
      if (isBudgetExceededError(err)) {
        logger.info(
          { jobId: job.id, userId: job.userId, message },
          "content job rejected: budget exceeded",
        );
      } else if (isCircuitOpenError(err)) {
        logger.warn(
          { jobId: job.id, userId: job.userId, breaker: err.breakerName },
          "content job rejected: provider circuit open",
        );
      } else {
        logger.error({ err, jobId: job.id }, "content job failed");
        Sentry.captureException(err, {
          tags: { source: "contentWorker.job" },
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

export async function enqueueContentGenerationJob(
  userId: string,
  brandId: string | null,
  payload: GenerationPayload,
): Promise<string> {
  const job = await storage.enqueueContentJob({
    userId,
    brandId: brandId || null,
    status: "pending",
    requestPayload: payload as any,
  } as InsertContentGenerationJob);
  return job.id;
}

export async function initContentGenerationWorker(): Promise<void> {
  // Crash recovery: any job left in `running` longer than the recovery
  // window is assumed to be orphaned (server was killed mid-job).
  try {
    const failed = await storage.failStuckContentJobs(STUCK_JOB_RECOVERY_MINUTES);
    if (failed > 0) {
      logger.info({ failed }, "marked stuck jobs as failed on boot");
    }
  } catch (err) {
    logger.error({ err }, "content worker boot recovery failed");
    Sentry.captureException(err, { tags: { source: "contentWorker.boot" } });
  }

  if (workerTimeout) return;

  // Chained setTimeout (not setInterval) so the gap between ticks
  // grows when there's no work and shrinks when there is. This
  // mirrors how a queue-driven worker would behave but stays in-process.
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
          // Even on a thrown error, keep the scheduler running.
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
