// FAQ generation/optimization business logic, extracted from
// server/routes/contentTypes.ts (phase B7-13).

import { storage } from "../storage";
import { MODELS } from "../lib/modelConfig";
import { openai, safeParseJson } from "../lib/routesShared";
import { loadBrandGenerationContext, renderFactsBlock } from "../lib/brandGenerationContext";
import { computeAiSurfaceScore } from "../lib/faqScoring";
import { enqueueLlmJob, classifyAiEnqueueError } from "../lib/llmJobs";
import { logger } from "../lib/logger";

// ─────────────────────────────────────────────────────────────────────────
// FAQ generation handler - registered at module-load.
//
// Server pattern: POST /api/faqs/generate/:brandId enqueues an OpenAI
// Responses background job and returns 202 + jobId. The client polls
// /api/llm-jobs/:jobId. When the run completes, this handler:
//   - parses { faqs: [...] } (tolerates bare [...] too)
//   - dedups against existing FAQs via findSimilarFaqQuestion
//   - persists new rows with computed aiSurfaceScore
//   - returns the same { data, report, tips } shape the client renders
// ─────────────────────────────────────────────────────────────────────────
export interface FaqGenerationPayload {
  brandId: string;
  brandName: string;
  faqCount: number;
}

export interface GeneratedFaq {
  question: string;
  answer: string;
  category?: string;
  optimizationTips?: string[];
}

export async function faqGenerationFinalize({
  payload,
  structuredOutput,
  outputText,
}: {
  payload: FaqGenerationPayload;
  structuredOutput: unknown;
  outputText: string;
}): Promise<{
  data: unknown[];
  report: {
    requested: number;
    generated: number;
    inserted: number;
    mergedDuplicates: number;
    invalid: number;
  };
  tips: string[];
}> {
  const parsed = structuredOutput as { faqs?: GeneratedFaq[] } | GeneratedFaq[] | null;
  const faqs: GeneratedFaq[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.faqs)
      ? parsed.faqs
      : [];
  if (faqs.length === 0) {
    throw new Error(
      outputText && outputText.length > 0
        ? "AI returned an unexpected response shape (no faqs[])."
        : "AI returned an empty response.",
    );
  }

  const ctx = await loadBrandGenerationContext(payload.brandId, []);
  if (!ctx) throw new Error("Brand not found at finalize time");
  const { brand } = ctx;

  const savedFaqs: unknown[] = [];
  let merged = 0;
  let invalid = 0;
  for (const faq of faqs) {
    if (!faq || typeof faq.question !== "string" || typeof faq.answer !== "string") {
      invalid += 1;
      continue;
    }
    try {
      const similar = await storage
        .findSimilarFaqQuestion(brand.id, faq.question)
        .catch(() => null);
      if (similar) {
        merged += 1;
        continue;
      }
      const aiSurfaceScore = computeAiSurfaceScore({
        question: faq.question,
        answer: faq.answer,
        brand: { name: brand.name, nameVariations: brand.nameVariations ?? [] },
      });
      const saved = await storage.createFaqItem({
        brandId: brand.id,
        question: faq.question,
        answer: faq.answer,
        category: faq.category ?? null,
        aiSurfaceScore,
        isOptimized: 0,
        optimizationTips: Array.isArray(faq.optimizationTips) ? faq.optimizationTips : [],
      });
      savedFaqs.push(saved);
    } catch (err) {
      logger.warn({ err }, "[faqs] handler.createFaqItem failed for one item");
    }
  }

  return {
    data: savedFaqs,
    report: {
      requested: payload.faqCount,
      generated: faqs.length,
      inserted: savedFaqs.length,
      mergedDuplicates: merged,
      invalid,
    },
    tips: [
      "Add FAQ schema markup to your pages for rich snippets",
      "Keep answers 40-60 words for optimal AI summarization",
      "Update FAQs quarterly with new questions from support",
      "Include FAQs on product pages, not just a dedicated FAQ page",
    ],
  };
}

export type OptimizeFaqResult = { kind: "parse_error" } | { kind: "ok"; faq: unknown };

interface FaqForOptimize {
  id: string;
  brandId: string | null;
  question: string;
  answer: string;
}

// Optimize a single FAQ for AI citation. Ownership over the FAQ must already
// be enforced by the caller.
export async function optimizeFaq(faq: FaqForOptimize): Promise<OptimizeFaqResult> {
  // Load the full grounding context from the fact sheet so the
  // optimizer can hedge against unverified claims rather than
  // inventing them.
  const ctx = faq.brandId ? await loadBrandGenerationContext(faq.brandId, []) : null;
  const brand = ctx?.brand ?? null;
  const factsBlock = ctx ? renderFactsBlock(ctx.facts) : "";
  const brandContext = brand
    ? `Brand: ${brand.name}, Industry: ${brand.industry}, Products: ${Array.isArray(brand.products) ? brand.products.join(", ") : "N/A"}`
    : "";

  const prompt = `You are an FAQ optimization expert for AI search engines. Optimize this FAQ for maximum AI citation likelihood.

Current FAQ:
Question: ${faq.question}
Answer: ${faq.answer}

Brand Context: ${brandContext}

${factsBlock}

Optimization requirements:
1. Question should be natural and mirror how users ask AI chatbots
2. Answer should be 40-60 words (optimal for AI summarization)
3. Answer should start with a direct response, then provide context
4. Use ONLY facts from the Verified-facts block above; hedge or omit anything unverified
5. Make it authoritative but conversational

Return JSON:
{
  "question": "Optimized question",
  "answer": "Optimized answer (40-60 words)",
  "optimizationTips": ["What was improved", "Additional suggestions"]
}

Return ONLY valid JSON. Do not include an aiSurfaceScore field - it is computed deterministically server-side.`;

  const response = await openai.chat.completions.create({
    model: MODELS.misc,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });

  const optimized = safeParseJson<any>(response.choices[0].message.content);
  if (!optimized) {
    return { kind: "parse_error" };
  }

  const finalQuestion = optimized.question || faq.question;
  const finalAnswer = optimized.answer || faq.answer;
  // Use a deterministic score. Ignore the LLM's number.
  const aiSurfaceScore = computeAiSurfaceScore({
    question: finalQuestion,
    answer: finalAnswer,
    brand: brand ? { name: brand.name, nameVariations: brand.nameVariations ?? [] } : null,
  });

  const updatedFaq = await storage.updateFaqItem(faq.id, {
    question: finalQuestion,
    answer: finalAnswer,
    aiSurfaceScore,
    isOptimized: 1,
    optimizationTips: Array.isArray(optimized.optimizationTips) ? optimized.optimizationTips : [],
  });

  return { kind: "ok", faq: updatedFaq };
}

// Recompute aiSurfaceScore deterministically when a PATCH changes the
// question or answer. The legacy LLM-self-scored field produced
// inconsistent values; this gives a stable signal. Returns undefined
// (leaving the caller's update untouched) when the FAQ can't be found,
// matching the route's previous inline behaviour.
export async function recomputeAiSurfaceScoreForEdit(
  faqId: string,
  update: { question?: string; answer?: string },
): Promise<number | undefined> {
  const existing = await storage.getFaqItemById(faqId);
  if (!existing) return undefined;
  const brand = await storage.getBrandById(existing.brandId);
  return computeAiSurfaceScore({
    question: update.question ?? existing.question,
    answer: update.answer ?? existing.answer,
    brand: brand ? { name: brand.name, nameVariations: brand.nameVariations ?? [] } : null,
  });
}

export type GenerateFaqsResult =
  | { kind: "enqueued"; jobId: string; status: string }
  | { kind: "ai_error"; status: number; body: unknown }
  | { kind: "service_error" };

interface BrandForFaqGeneration {
  id: string;
  name: string;
  industry: string | null;
  description: string | null;
  products: string[] | null;
}

// Generate optimized FAQs for a brand. Ownership and the cooldown gate must
// already be enforced by the caller.
export async function generateFaqs(params: {
  brand: BrandForFaqGeneration;
  facts: Parameters<typeof renderFactsBlock>[0];
  topic: unknown;
  count: unknown;
  userId: string;
}): Promise<GenerateFaqsResult> {
  const { brand, facts, topic, count, userId } = params;
  const factsBlock = renderFactsBlock(facts);
  const faqCount = Math.min(Math.max(parseInt(count as string) || 5, 1), 20);

  const prompt = `You are an FAQ optimization expert for AI search engines. Generate exactly ${faqCount} FAQs for ${brand.name} (${brand.industry}).

Topic focus: ${topic || brand.industry}
Company description: ${brand.description || ""}
Products/Services: ${Array.isArray(brand.products) ? brand.products.join(", ") : ""}

${factsBlock}

Grounding rules:
- Use only the verified facts above for any specific number, percentage, feature, or named integration.
- For anything not in that block, hedge ("commonly", "typically") or omit. Never invent specific numbers.

Generate FAQs that:
1. Mirror how users ask AI chatbots questions
2. Have clear, concise answers (40-60 words optimal)
3. Include the brand name naturally where relevant
4. Cover common objections and buying considerations

Return a JSON object of this exact shape:
{
  "faqs": [
    {
      "question": "The question users might ask AI",
      "answer": "Concise, authoritative answer",
      "category": "pricing|features|comparison|support|general",
      "optimizationTips": ["tip1", "tip2"]
    }
  ]
}

Return ONLY the JSON object (no prose, no markdown fences). Do NOT include any aiSurfaceScore field - it is computed server-side from a deterministic heuristic.`;

  // Vercel-Hobby-safe: enqueue an OpenAI Responses background
  // job. Kickoff returns instantly with a jobId. The finalize handler
  // registered above (kind="faq_generation") parses the output,
  // dedups against existing FAQs, persists rows, and returns the
  // { data, report, tips } shape the client renders.
  try {
    const job = await enqueueLlmJob<FaqGenerationPayload>({
      kind: "faq_generation",
      payload: { brandId: brand.id, brandName: brand.name, faqCount },
      brandId: brand.id,
      userId,
      model: MODELS.misc,
      input: prompt,
      responseFormat: { type: "json_object" },
    });
    return { kind: "enqueued", jobId: job.jobId, status: job.status };
  } catch (aiErr: unknown) {
    const e = aiErr as { status?: number; name?: string };
    const mapped = classifyAiEnqueueError(e);
    if (mapped) return { kind: "ai_error", status: mapped.status, body: mapped.body };
    return { kind: "service_error" };
  }
}
