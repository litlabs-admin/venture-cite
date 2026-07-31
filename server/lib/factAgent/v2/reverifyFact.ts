// Per-fact re-verification.
//
// Once a fact is N days old, we want to confirm it's still accurate
// without re-running a full brand scrape (10 pages × LLM call ≈
// $0.01-0.10 per brand). The cheaper play: hit the original source
// URL, re-extract just this one fact, compare values.
//
// Outcomes:
//   - "verified": new value matches stored value (case-insensitive,
//     punctuation-stripped). Bumps last_verified, increments
//     verification_attempts, sets verification_status='verified'.
//   - "drift_detected": new value is different and confidence is
//     comparable. Push the new value into alternatives, increment
//     disagreement_count, set verification_status='drift_detected'.
//     Operators can decide whether to swap canonical or leave it.
//   - "source_unreachable": page fetch failed (404, WAF, timeout).
//     Set verification_status='source_unreachable',
//     verification_attempts++. After N retries, the cron stops trying.
//   - "no_value_in_source": page reachable but the fact isn't there
//     anymore. Treated similar to drift but with a more specific
//     status.
//
// Cost: 1 HTTP fetch + 1 LLM call per fact ≈ $0.0005. With ~50 stale
// facts per brand and ~10,000 brands, daily cron cost is ~$0.25.
//
// What this DOES NOT do:
//   - Replace full re-scrape entirely. Brand-level changes (new
//     products, new HQ) still need a full re-scrape.
//   - Re-verify user_overridden facts. Those are off-limits.
//   - Re-verify facts whose source URL is unknown.

import { db } from "../../../db";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { logger } from "../../logger";
import { safeFetchTextWithLockedIp } from "../../ssrf";
import { extractStructuredFacts } from "./structuredDataExtractor";
import { buildExtractionPrompt, parseFactsWithRepair, type LlmCallable } from "./extractionPrompt";
import { sanitizeHydration } from "./hydrationSanitizer";
import { extractHydration } from "./rscExtractor";
import { extractStructuredData, stripToBodyText } from "./pageExtractors";
import { emitEvent } from "./eventLog";
import { PAGE_FETCH_TIMEOUT_MS } from "./vercelBudget";
import {
  type Fact,
  type AlternativeEntry,
  type SourceEntry,
  type ValuePayload,
} from "@shared/factAgent/schema";

const MAX_VERIFICATION_ATTEMPTS = 5;

export type VerifyOutcome =
  | "verified"
  | "drift_detected"
  | "source_unreachable"
  | "no_value_in_source"
  | "user_overridden"
  | "skipped";

export interface VerifyFactArgs {
  factId: string;
  llm: LlmCallable;
}

export interface VerifyFactResult {
  outcome: VerifyOutcome;
  durationMs: number;
  details: Record<string, unknown>;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function reverifyFact(args: VerifyFactArgs): Promise<VerifyFactResult> {
  const start = Date.now();
  const rows = await db
    .select()
    .from(schema.brandFactSheet)
    .where(eq(schema.brandFactSheet.id, args.factId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return {
      outcome: "skipped",
      durationMs: Date.now() - start,
      details: { reason: "fact_not_found" },
    };
  }
  if (row.userOverridden) {
    return {
      outcome: "user_overridden",
      durationMs: Date.now() - start,
      details: { factId: row.id },
    };
  }
  if (!row.sourceUrl) {
    await db
      .update(schema.brandFactSheet)
      .set({
        verificationAttempts: sql`${schema.brandFactSheet.verificationAttempts} + 1`,
        lastVerificationAt: new Date(),
        verificationStatus: "source_unreachable",
      })
      .where(eq(schema.brandFactSheet.id, row.id));
    return {
      outcome: "source_unreachable",
      durationMs: Date.now() - start,
      details: { reason: "no_source_url" },
    };
  }

  // Brand context for the prompt - fetched cheaply.
  const brandRows = await db
    .select({
      id: schema.brands.id,
      name: schema.brands.name,
      website: schema.brands.website,
      industry: schema.brands.industry,
    })
    .from(schema.brands)
    .where(eq(schema.brands.id, row.brandId))
    .limit(1);
  const brand = brandRows[0];

  // Fetch source.
  let fetched: { status: number; text: string; contentType: string | null };
  try {
    const res = await safeFetchTextWithLockedIp(row.sourceUrl, {
      maxBytes: 2 * 1024 * 1024,
      // Tier-aware: ~6s Hobby, 10s Pro. Reverify doesn't get a
      // second chance per tick - the unreachable counter bumps and
      // we move on.
      timeoutMs: PAGE_FETCH_TIMEOUT_MS,
    });
    fetched = { status: res.status, text: res.text, contentType: res.contentType };
  } catch (err) {
    await db
      .update(schema.brandFactSheet)
      .set({
        verificationAttempts: sql`${schema.brandFactSheet.verificationAttempts} + 1`,
        lastVerificationAt: new Date(),
        verificationStatus: "source_unreachable",
      })
      .where(eq(schema.brandFactSheet.id, row.id));
    return {
      outcome: "source_unreachable",
      durationMs: Date.now() - start,
      details: { errorMessage: (err as Error).message.slice(0, 200) },
    };
  }

  if (fetched.status < 200 || fetched.status >= 300) {
    await db
      .update(schema.brandFactSheet)
      .set({
        verificationAttempts: sql`${schema.brandFactSheet.verificationAttempts} + 1`,
        lastVerificationAt: new Date(),
        verificationStatus: "source_unreachable",
      })
      .where(eq(schema.brandFactSheet.id, row.id));
    return {
      outcome: "source_unreachable",
      durationMs: Date.now() - start,
      details: { httpStatus: fetched.status },
    };
  }

  // First try the cheap path: structured-data pre-pass.
  let structuredCandidate: Fact | null = null;
  const structuredFacts = extractStructuredFacts(fetched.text, row.sourceUrl);
  for (const sf of structuredFacts) {
    if (sf.domain === row.domain && sf.factKey === row.factKey) {
      structuredCandidate = sf;
      break;
    }
  }

  // If structured data didn't have it, run the LLM stage on the page.
  let llmCandidate: Fact | null = null;
  if (!structuredCandidate) {
    const hydra = extractHydration(fetched.text);
    const sanitized = sanitizeHydration(hydra.payload);
    const structured = extractStructuredData(fetched.text);
    const body = stripToBodyText(fetched.text).slice(0, 8000);
    const payload = [structured.text, sanitized, body].filter((s) => s.length > 0).join("\n\n");
    const prompt = buildExtractionPrompt(payload, {
      brandUrl: brand?.website ?? "",
      brandName: brand?.name,
      industry: brand?.industry ?? null,
    });
    try {
      const parsed = await parseFactsWithRepair(prompt, args.llm);
      for (const ef of parsed.facts) {
        if (ef.domain === row.domain && ef.factKey === row.factKey) {
          llmCandidate = ef;
          break;
        }
      }
    } catch (err) {
      // LLM failed - record an attempt and bail.
      await db
        .update(schema.brandFactSheet)
        .set({
          verificationAttempts: sql`${schema.brandFactSheet.verificationAttempts} + 1`,
          lastVerificationAt: new Date(),
          verificationStatus: "source_unreachable",
        })
        .where(eq(schema.brandFactSheet.id, row.id));
      return {
        outcome: "source_unreachable",
        durationMs: Date.now() - start,
        details: { errorMessage: (err as Error).message.slice(0, 200) },
      };
    }
  }

  const candidate = structuredCandidate ?? llmCandidate;
  if (!candidate) {
    // Fact is no longer present in the source.
    await db
      .update(schema.brandFactSheet)
      .set({
        verificationAttempts: sql`${schema.brandFactSheet.verificationAttempts} + 1`,
        lastVerificationAt: new Date(),
        verificationStatus: "drift_detected",
        disagreementCount: sql`${schema.brandFactSheet.disagreementCount} + 1`,
      })
      .where(eq(schema.brandFactSheet.id, row.id));
    return {
      outcome: "no_value_in_source",
      durationMs: Date.now() - start,
      details: { sourceUrl: row.sourceUrl },
    };
  }

  if (normalize(candidate.factValue) === normalize(row.factValue)) {
    // Match - bump last_verified.
    await db
      .update(schema.brandFactSheet)
      .set({
        lastVerified: new Date(),
        lastVerificationAt: new Date(),
        verificationAttempts: sql`${schema.brandFactSheet.verificationAttempts} + 1`,
        verificationStatus: "verified",
      })
      .where(eq(schema.brandFactSheet.id, row.id));
    return {
      outcome: "verified",
      durationMs: Date.now() - start,
      details: { sourceUrl: row.sourceUrl, value: row.factValue },
    };
  }

  // Drift detected.
  const existingPayload: ValuePayload = (row.valuePayload as ValuePayload) ?? {};
  const existingAlts: AlternativeEntry[] = existingPayload?.alternatives ?? [];
  const newSource: SourceEntry = {
    url: row.sourceUrl,
    excerpt: candidate.sourceExcerpt ?? "",
    confidence: candidate.confidence,
  };
  const existingIdx = existingAlts.findIndex(
    (a) => normalize(a.value) === normalize(candidate.factValue),
  );
  let alternatives: AlternativeEntry[];
  if (existingIdx >= 0) {
    alternatives = [...existingAlts];
    const byUrl = new Map(alternatives[existingIdx].sources.map((s) => [s.url, s]));
    if (!byUrl.has(newSource.url)) byUrl.set(newSource.url, newSource);
    alternatives[existingIdx] = {
      value: alternatives[existingIdx].value,
      sources: Array.from(byUrl.values()).slice(0, 20),
    };
  } else {
    alternatives = [...existingAlts, { value: candidate.factValue, sources: [newSource] }].slice(
      0,
      10,
    );
  }
  await db
    .update(schema.brandFactSheet)
    .set({
      valuePayload: { ...existingPayload, alternatives },
      lastVerificationAt: new Date(),
      verificationAttempts: sql`${schema.brandFactSheet.verificationAttempts} + 1`,
      verificationStatus: "drift_detected",
      disagreementCount: sql`${schema.brandFactSheet.disagreementCount} + 1`,
    })
    .where(eq(schema.brandFactSheet.id, row.id));

  return {
    outcome: "drift_detected",
    durationMs: Date.now() - start,
    details: {
      sourceUrl: row.sourceUrl,
      oldValue: row.factValue,
      newValue: candidate.factValue,
    },
  };
}

/** Find facts due for re-verification. Stale = last_verified > 30
 *  days AND user_overridden = false AND is_active = 1 AND
 *  verification_attempts < MAX. */
export async function findStaleFacts(
  limit: number,
): Promise<Array<{ id: string; brandId: string; factKey: string }>> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: schema.brandFactSheet.id,
      brandId: schema.brandFactSheet.brandId,
      factKey: schema.brandFactSheet.factKey,
    })
    .from(schema.brandFactSheet)
    .where(
      and(
        eq(schema.brandFactSheet.userOverridden, false),
        eq(schema.brandFactSheet.isActive, 1),
        sql`${schema.brandFactSheet.lastVerified} < ${cutoff}`,
        sql`${schema.brandFactSheet.verificationAttempts} < ${MAX_VERIFICATION_ATTEMPTS}`,
      ),
    )
    .limit(limit);
  return rows;
}

/** Cron entry point - verify up to `batchSize` stale facts in this tick. */
export async function runReverificationBatch(
  batchSize: number,
  llm: LlmCallable,
): Promise<{
  attempted: number;
  verified: number;
  drift: number;
  unreachable: number;
}> {
  const stale = await findStaleFacts(batchSize);
  const counters = { attempted: 0, verified: 0, drift: 0, unreachable: 0 };
  for (const row of stale) {
    counters.attempted++;
    try {
      const result = await reverifyFact({ factId: row.id, llm });
      if (result.outcome === "verified") counters.verified++;
      else if (result.outcome === "drift_detected" || result.outcome === "no_value_in_source")
        counters.drift++;
      else if (result.outcome === "source_unreachable") counters.unreachable++;
      // Emit a tiny event so the inspector / dashboards can show
      // verification activity per brand without re-querying every row.
      emitEvent({
        runId: `verify-${row.id}`, // synthetic per-fact run id
        brandId: row.brandId,
        stepName: "fact_reverify",
        outcome:
          result.outcome === "verified"
            ? "ok"
            : result.outcome === "source_unreachable"
              ? "failed"
              : "skipped",
        durationMs: result.durationMs,
        metadata: { factId: row.id, outcome: result.outcome, ...result.details },
      });
    } catch (err) {
      logger.warn(
        { err, factId: row.id },
        "runReverificationBatch: unexpected error on a single fact",
      );
    }
  }
  return counters;
}
