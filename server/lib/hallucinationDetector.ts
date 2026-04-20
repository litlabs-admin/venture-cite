import OpenAI from "openai";
import { storage } from "../storage";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
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

function safeParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  const candidate = match ? match[0] : stripped;
  try { return JSON.parse(candidate) as T; } catch { return null; }
}

interface HallucinationFinding {
  claimedStatement: string;
  contradictingFact: string;
  severity: "low" | "medium" | "high";
  category?: string;
}

/**
 * Compare each cited response in a citation run against the brand's fact
 * sheet; insert `brand_hallucinations` rows for every contradiction the
 * judge finds. Best-effort — errors on individual rows log and continue.
 *
 * Skipped entirely if the fact sheet has fewer than MIN_FACT_SHEET_ROWS
 * entries (we need real facts to compare against, not a mostly-empty sheet).
 */
export async function detectHallucinationsForRun(
  brandId: string,
  rankings: GeoRanking[],
): Promise<number> {
  const factSheet = await storage.getBrandFacts(brandId).catch(() => []);
  if (factSheet.length < MIN_FACT_SHEET_ROWS) {
    console.log(`[hallucinationDetector] skipping — fact sheet has ${factSheet.length} rows (min ${MIN_FACT_SHEET_ROWS})`);
    return 0;
  }

  const factBlock = factSheet
    .filter((f: any) => f.isActive !== 0)
    .map((f: any) => `- ${f.factCategory}/${f.factKey}: ${f.factValue}`)
    .join("\n");

  const citedRankings = rankings.filter((r) => r.isCited === 1 && r.citationContext);
  if (citedRankings.length === 0) return 0;

  let inserted = 0;

  for (const ranking of citedRankings) {
    const responseText = extractResponseText(ranking.citationContext);
    if (!responseText) continue;

    const findings = await judgeHallucinations(responseText, factBlock).catch((err) => {
      console.warn(`[hallucinationDetector] judge call failed for ranking ${ranking.id}:`, err instanceof Error ? err.message : err);
      return [] as HallucinationFinding[];
    });

    for (const f of findings) {
      try {
        // Dedupe by claimedStatement + platform so re-running doesn't duplicate.
        const existing = await storage
          .getBrandHallucinations(brandId)
          .catch(() => [] as any[]);
        const dup = existing.some(
          (h: any) =>
            h.aiPlatform === ranking.aiPlatform &&
            h.claimedStatement === f.claimedStatement,
        );
        if (dup) continue;

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
        } as any);
        inserted += 1;
      } catch (err) {
        console.warn(`[hallucinationDetector] insert failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(`[hallucinationDetector] inserted ${inserted} hallucinations for brand ${brandId}`);
  return inserted;
}

function extractResponseText(citationContext: string | null): string | null {
  if (!citationContext) return null;
  const idx = citationContext.indexOf(RAW_DELIM);
  if (idx === -1) return null;
  const text = citationContext.slice(idx + RAW_DELIM.length).trim();
  return text.length > MAX_RESPONSE_CHARS ? text.slice(0, MAX_RESPONSE_CHARS) : text;
}

async function judgeHallucinations(
  responseText: string,
  factBlock: string,
): Promise<HallucinationFinding[]> {
  const completion = await openai.chat.completions.create({
    model: MODELS.misc,
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 800,
    messages: [
      {
        role: "system",
        content: `You are a fact-checker. Given an AI-generated response and a verified brand fact sheet, identify any statements in the response that clearly contradict the fact sheet.

Rules:
- Only flag CLEAR factual contradictions (year mismatch, wrong HQ, wrong founder, wrong pricing, wrong product feature).
- Do NOT flag subjective claims, superlatives, or omissions.
- Severity: "low" = minor imprecision (off by one year, rounded number), "medium" = misleading claim, "high" = false claim about company identity, pricing, products, or people.

Return JSON exactly in this shape:
{"hallucinations": [{"claimedStatement": string, "contradictingFact": string, "severity": "low"|"medium"|"high", "category": string}]}

If no contradictions, return {"hallucinations": []}.`,
      },
      {
        role: "user",
        content: `Fact sheet:\n${factBlock}\n\nAI response:\n"""\n${responseText}\n"""`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  const parsed = safeParseJson<{ hallucinations?: HallucinationFinding[] }>(raw);
  if (!parsed || !Array.isArray(parsed.hallucinations)) return [];

  return parsed.hallucinations
    .filter((h) => h && typeof h.claimedStatement === "string" && typeof h.contradictingFact === "string")
    .map((h) => ({
      claimedStatement: String(h.claimedStatement).slice(0, 500),
      contradictingFact: String(h.contradictingFact).slice(0, 500),
      severity: (h.severity === "low" || h.severity === "medium" || h.severity === "high") ? h.severity : "medium",
      category: h.category ? String(h.category).slice(0, 64) : undefined,
    }));
}
