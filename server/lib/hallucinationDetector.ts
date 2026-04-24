import OpenAI from "openai";
import pLimit from "p-limit";
import { z } from "zod";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import { parseLLMJson, LLMParseError } from "./llmParse";
import { logger } from "./logger";
import type { GeoRanking } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

const MIN_FACT_SHEET_ROWS = 3;
const MAX_RESPONSE_CHARS = 8_000;
const RAW_DELIM = "||| RAW_RESPONSE |||";
const JUDGE_CONCURRENCY = 5;
const MAX_FACTS_IN_PROMPT = 40;

const findingSchema = z.object({
  claimedStatement: z.string().min(1),
  contradictingFact: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  category: z.string().optional(),
});
const judgeSchema = z.object({
  hallucinations: z.array(findingSchema).max(20),
});

type HallucinationFinding = z.infer<typeof findingSchema>;

export interface DetectionSummary {
  inserted: number;
  skipped: boolean;
  skipReason?: "insufficient_facts" | "no_cited_rankings";
  factCount: number;
}

/**
 * Compare each cited response in a citation run against the brand's fact
 * sheet; insert `brand_hallucinations` rows for every contradiction the
 * judge finds.
 *
 * Dedup is handled at the DB level via the unique index on
 * (brand_id, ai_platform, md5(claimed_statement)) — createBrandHallucination
 * upserts so concurrent runs can't insert duplicates. Each hallucination
 * row carries the originating ranking_id / citing_outlet_url so the user
 * can trace it back to where ChatGPT/Perplexity said it.
 *
 * LLM calls are capped at JUDGE_CONCURRENCY concurrent requests.
 *
 * Returns {inserted, skipped, skipReason} so the UI can surface why a
 * run found nothing (fact sheet too small vs genuinely no issues).
 */
export async function detectHallucinationsForRun(
  brandId: string,
  rankings: GeoRanking[],
): Promise<DetectionSummary> {
  if (!process.env.OPENAI_API_KEY) {
    logger.warn({ brandId }, "hallucinationDetector: OPENAI_API_KEY missing — skipping");
    return { inserted: 0, skipped: true, skipReason: "insufficient_facts", factCount: 0 };
  }
  const factSheet = await storage.getBrandFacts(brandId).catch((err) => {
    logger.warn({ err, brandId }, "hallucinationDetector: getBrandFacts threw — treating as empty");
    return [] as any[];
  });
  const activeFacts = factSheet.filter((f: any) => f.isActive !== 0);
  if (activeFacts.length < MIN_FACT_SHEET_ROWS) {
    logger.info(
      { brandId, factCount: activeFacts.length, min: MIN_FACT_SHEET_ROWS },
      "hallucinationDetector: skipping — fact sheet too small",
    );
    return {
      inserted: 0,
      skipped: true,
      skipReason: "insufficient_facts",
      factCount: activeFacts.length,
    };
  }

  // Weight manual facts above scraped: scraped ones can themselves be
  // stale / wrong. Pass them to the judge in two clearly-labeled blocks.
  const manualBlock = activeFacts
    .filter((f: any) => f.source !== "scraped")
    .slice(0, MAX_FACTS_IN_PROMPT)
    .map((f: any) => `- ${f.factCategory}/${f.factKey}: ${f.factValue}`)
    .join("\n");
  const scrapedBlock = activeFacts
    .filter((f: any) => f.source === "scraped")
    .slice(0, MAX_FACTS_IN_PROMPT)
    .map((f: any) => `- ${f.factCategory}/${f.factKey}: ${f.factValue}`)
    .join("\n");

  const citedRankings = rankings.filter((r) => r.isCited === 1 && r.citationContext);
  if (citedRankings.length === 0) {
    return {
      inserted: 0,
      skipped: true,
      skipReason: "no_cited_rankings",
      factCount: activeFacts.length,
    };
  }

  const limit = pLimit(JUDGE_CONCURRENCY);
  let inserted = 0;

  const judgeTasks = citedRankings.map((ranking) =>
    limit(async () => {
      const extracted = extractResponseText(ranking.citationContext);
      if (extracted.kind === "empty") return;
      if (extracted.kind === "malformed") {
        logger.warn(
          { brandId, rankingId: ranking.id },
          "hallucinationDetector: ranking citationContext missing RAW_RESPONSE delimiter",
        );
        return;
      }

      let findings: HallucinationFinding[];
      try {
        findings = await judgeHallucinations(extracted.text, manualBlock, scrapedBlock);
      } catch (err) {
        logger.warn(
          { err, brandId, rankingId: ranking.id },
          "hallucinationDetector: judge call failed",
        );
        return;
      }

      for (const f of findings) {
        try {
          await storage.createBrandHallucination({
            brandId,
            aiPlatform: ranking.aiPlatform,
            prompt: ranking.prompt,
            claimedStatement: f.claimedStatement,
            actualFact: f.contradictingFact,
            hallucinationType: "fact_contradiction",
            severity: f.severity,
            category: f.category || null,
            isResolved: 0,
            remediationStatus: "pending",
            // Source traceback.
            rankingId: ranking.id,
            citingOutletUrl: (ranking as any).citingOutletUrl ?? null,
            citationContext: ranking.citationContext ?? null,
            articleTitle: null, // we don't have article title here
          } as any);
          inserted += 1;
        } catch (err) {
          logger.warn(
            { err, brandId, rankingId: ranking.id },
            "hallucinationDetector: upsert failed",
          );
        }
      }
    }),
  );

  await Promise.all(judgeTasks);

  logger.info(
    { brandId, inserted, rankings: citedRankings.length },
    "hallucinationDetector: complete",
  );
  return { inserted, skipped: false, factCount: activeFacts.length };
}

type Extracted = { kind: "empty" } | { kind: "malformed" } | { kind: "text"; text: string };

function extractResponseText(citationContext: string | null): Extracted {
  if (!citationContext) return { kind: "empty" };
  const idx = citationContext.indexOf(RAW_DELIM);
  if (idx === -1) return { kind: "malformed" };
  const text = citationContext.slice(idx + RAW_DELIM.length).trim();
  if (!text) return { kind: "empty" };
  return {
    kind: "text",
    text: text.length > MAX_RESPONSE_CHARS ? text.slice(0, MAX_RESPONSE_CHARS) : text,
  };
}

async function judgeHallucinations(
  responseText: string,
  manualBlock: string,
  scrapedBlock: string,
): Promise<HallucinationFinding[]> {
  const completion = await openai.chat.completions.create({
    model: MODELS.misc,
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 800,
    messages: [
      {
        role: "system",
        content: `You are a strict fact-checker. Given an AI-generated response and a verified brand fact sheet, identify statements in the response that DIRECTLY contradict the fact sheet.

HARD RULES:
- Use ONLY the facts in the fact sheet. Do NOT use external knowledge or plausible inference.
- The "Manual facts" block is authoritative. "Scraped facts" are lower-confidence; only use them when they reinforce a manual fact or when no manual fact exists on that topic.
- Do NOT flag: subjective claims, superlatives, marketing language, opinions, comparative claims ("better than X"), market-share claims, omissions, or reasonable paraphrases.
- Flag ONLY direct factual contradictions (year mismatch, wrong HQ, wrong founder/CEO, wrong pricing, wrong product feature, wrong headcount).

Severity scale:
- "critical" — identity-level error (wrong founder, wrong HQ country, wrong core product)
- "high" — material factual error (wrong pricing tier, wrong launch year, wrong acquisition status)
- "medium" — misleading claim that could mislead a buyer
- "low" — minor imprecision (off by one year, rounded number)

Return JSON exactly in this shape:
{"hallucinations": [{"claimedStatement": string, "contradictingFact": string, "severity": "low"|"medium"|"high"|"critical", "category": string}]}

If no contradictions, return {"hallucinations": []}.`,
      },
      {
        role: "user",
        content: `Manual facts (authoritative):
${manualBlock || "(none)"}

Scraped facts (lower confidence):
${scrapedBlock || "(none)"}

AI response:
"""
${responseText}
"""`,
      },
    ],
  });

  try {
    const parsed = parseLLMJson(completion.choices[0]?.message?.content ?? "", judgeSchema);
    return parsed.hallucinations.map((h) => ({
      claimedStatement: h.claimedStatement.slice(0, 500),
      contradictingFact: h.contradictingFact.slice(0, 500),
      severity: h.severity,
      category: h.category ? h.category.slice(0, 64) : undefined,
    }));
  } catch (err) {
    if (err instanceof LLMParseError) {
      logger.warn(
        { err: err.message, raw: err.raw.slice(0, 300) },
        "hallucinationDetector: judge output malformed",
      );
      return [];
    }
    throw err;
  }
}

/**
 * Re-verification pass. After a citation run completes, look at existing
 * hallucinations that are still open (pending / in_progress). If none of
 * this run's ranking responses contain the claimedStatement any more,
 * auto-flip the status to "verified" — the user's remediation worked (or
 * the model stopped hallucinating, same outcome).
 *
 * Best-effort; tolerates per-row failures.
 */
export async function reverifyHallucinationsForRun(
  brandId: string,
  rankings: GeoRanking[],
): Promise<number> {
  const open = await storage.getBrandHallucinations(brandId).catch((err) => {
    logger.warn({ err, brandId }, "reverifyHallucinationsForRun: getBrandHallucinations threw");
    return [] as any[];
  });
  const candidates = open.filter(
    (h: any) => h.remediationStatus === "in_progress" || h.remediationStatus === "pending",
  );
  if (candidates.length === 0) return 0;

  const cited = rankings.filter((r) => r.isCited === 1 && r.citationContext);
  const blobsByPlatform = new Map<string, string>();
  for (const r of cited) {
    const ex = extractResponseText(r.citationContext);
    if (ex.kind !== "text") continue;
    blobsByPlatform.set(
      r.aiPlatform,
      (blobsByPlatform.get(r.aiPlatform) ?? "") + "\n" + ex.text.toLowerCase(),
    );
  }
  if (blobsByPlatform.size === 0) return 0;

  let verified = 0;
  for (const hall of candidates) {
    const blob = blobsByPlatform.get(hall.aiPlatform);
    // If this run didn't touch the platform, we can't say anything.
    if (!blob) continue;
    // A loose check: if a 40-char slice of the claimed statement isn't in
    // the new response, treat as resolved. Strict enough for wrong years,
    // wrong names, wrong numbers.
    const key = (hall.claimedStatement ?? "").toLowerCase().slice(0, 40);
    if (!key) continue;
    if (!blob.includes(key)) {
      try {
        const { assertTransition } = await import("./statusTransitions");
        assertTransition("hallucination_remediation", hall.remediationStatus, "verified");
        await storage.updateBrandHallucination(hall.id, {
          remediationStatus: "verified",
          isResolved: 1,
          resolvedAt: new Date(),
        } as any);
        verified += 1;
      } catch {
        /* illegal transition or DB error — skip */
      }
    }
  }
  logger.info({ brandId, verified }, "hallucinationDetector: re-verification complete");
  return verified;
}
