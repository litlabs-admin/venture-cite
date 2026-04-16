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
import type { ContentGenerationJob, InsertContentGenerationJob } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

const POLL_INTERVAL_MS = 5_000;
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
  maxAttempts = 3,
): Promise<{ humanizedContent: string; humanScore: number; attempts: number; issues: string[]; strengths: string[] }> {
  let currentContent = content;
  let humanScore = 0;
  let attempts = 0;
  let issues: string[] = [];
  let strengths: string[] = [];
  let bestContent = content;
  let bestScore = 0;
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
    const rewrite = await openai.chat.completions.create({
      model: MODELS.contentHumanize,
      messages: [
        { role: "system", content: passes[i] },
        { role: "user", content: `Rewrite this to sound naturally human, keeping all info + markdown:\n\n${currentContent}` },
      ],
      max_tokens: perCallMaxTokens,
      temperature: 1.0,
    });
    currentContent = rewrite.choices[0].message.content || currentContent;

    const analysis = await openai.chat.completions.create({
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

async function generateArticleForJob(job: ContentGenerationJob): Promise<{ articleId: string }> {
  const payload = job.requestPayload as unknown as GenerationPayload;
  const { keywords, industry, type, brandId, humanize = true, targetCustomers, geography, contentStyle = "b2c" } = payload;

  let brand = brandId ? await storage.getBrandById(brandId) : null;

  const contentTypePrompts: Record<string, string> = {
    "Article": "comprehensive article (1500-2000 words)",
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

  const response = await openai.chat.completions.create({
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
  });

  let finalContent = response.choices[0].message.content || "";
  let humanScore = 0;
  let humanizationAttempts = 0;

  if (humanize && finalContent) {
    const result = await humanizeContent(finalContent, industry, 3);
    finalContent = result.humanizedContent;
    humanScore = result.humanScore;
    humanizationAttempts = result.attempts;
  }

  // Derive a title from the first markdown heading, or fall back to keywords.
  const headingMatch = finalContent.match(/^#\s+(.+)$/m);
  const title = headingMatch?.[1]?.trim() || `${keywords} — ${industry}`;
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)}-${Date.now().toString(36)}`;

  const article = await storage.createArticle({
    brandId: brandId || null,
    title,
    slug,
    content: finalContent,
    industry,
    contentType: type,
    keywords: keywords ? keywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
    author: "GEO Platform",
    seoData: {
      humanScore,
      humanizationAttempts,
      passesAiDetection: humanScore >= 70,
      generatedVia: "background-worker",
    },
  } as any);

  // Increment usage only on successful persistence.
  await storage.incrementArticleUsage(job.userId);

  return { articleId: article.id };
}

let workerInterval: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  try {
    const job = await storage.claimPendingContentJob();
    if (!job) return;
    console.log(`[contentWorker] claimed job ${job.id} for user ${job.userId}`);
    try {
      const { articleId } = await generateArticleForJob(job);
      await storage.updateContentJob(job.id, {
        status: "succeeded",
        articleId,
        completedAt: new Date(),
      });
      console.log(`[contentWorker] job ${job.id} succeeded → article ${articleId}`);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      await storage.updateContentJob(job.id, {
        status: "failed",
        errorMessage: message.slice(0, 500),
        completedAt: new Date(),
      });
      console.error(`[contentWorker] job ${job.id} failed:`, message);
    }
  } catch (pollErr) {
    console.error("[contentWorker] tick error:", pollErr);
  }
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
      console.log(`[contentWorker] marked ${failed} stuck jobs as failed on boot`);
    }
  } catch (err) {
    console.error("[contentWorker] boot recovery failed:", err);
  }

  if (workerInterval) return;
  workerInterval = setInterval(() => {
    tick().catch((err) => console.error("[contentWorker] unhandled tick error:", err));
  }, POLL_INTERVAL_MS);
  console.log(`[contentWorker] started (poll every ${POLL_INTERVAL_MS}ms)`);
}
