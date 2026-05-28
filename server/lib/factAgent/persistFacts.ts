// Spec 2 §4.2 Phase 2 step 9: persist scraped facts to brand_fact_sheet.
//
// v2 (2026-05-28): provenance-preserving upsert.
//
// The previous implementation upserted by (brandId, domain, subcategory,
// factKey) with the partial unique index from migration 0059. That
// gave us cross-page dedup at the row level — but the UPDATE clause
// just overwrote factValue / sourceUrl / sourceExcerpt with the most
// recent page's data, silently dropping the first N-1 pages'
// provenance. With the v2 controlled-vocabulary contract, all four
// production audit sites now produce the SAME factKey across pages,
// which exposes this overwrite. We now MERGE: each page that sees the
// same fact contributes its (url, excerpt, confidence) into
// valuePayload.sources, and pages that report a different value
// contribute into valuePayload.alternatives. The canonical row holds
// whichever variant has the highest confidence.
//
// Concurrency note: `runFullScrapeForBrand` holds a per-brand advisory
// lock for the entire run, so the read-modify-write pattern here is
// safe. The lock is documented in
// `server/lib/advisoryLock.ts:dynamicLockNamespaces.fullBrandScrape`.

import { db } from "../../db";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { logger } from "../logger";
import {
  CURRENT_SCHEMA_VERSION,
  MAX_ALTERNATIVES_PER_FACT,
  MAX_SOURCES_PER_FACT,
  subcategoryFor,
  type AlternativeEntry,
  type Domain,
  type Fact,
  type SourceEntry,
  type ValuePayload,
} from "@shared/factAgent/schema";

/** Internal shape persistFacts needs — extends Fact with the
 *  server-derived subcategory and a non-optional sourceUrl. */
interface FactToPersist extends Fact {
  subcategory: string;
  sourceUrl: string;
}

interface PersistArgs {
  brandId: string;
  runId: string;
  sourceUrl: string;
}

function normalizeValue(v: string): string {
  return v.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Build a fresh sources entry from an extracted fact. */
function sourceEntryFor(f: FactToPersist): SourceEntry {
  return {
    url: f.sourceUrl,
    excerpt: f.sourceExcerpt ?? "",
    confidence: f.confidence,
  };
}

/** Merge a new source into a sorted, deduped sources array. Same URL
 *  collapses (highest-confidence wins, longer excerpt wins on tie).
 *  Caps at MAX_SOURCES_PER_FACT — older / lower-confidence entries
 *  fall off the tail. */
function mergeSources(existing: SourceEntry[], incoming: SourceEntry): SourceEntry[] {
  const byUrl = new Map<string, SourceEntry>();
  for (const s of existing) byUrl.set(s.url, s);
  const prior = byUrl.get(incoming.url);
  if (prior) {
    const winner =
      incoming.confidence > prior.confidence
        ? incoming
        : incoming.confidence === prior.confidence && incoming.excerpt.length > prior.excerpt.length
          ? incoming
          : prior;
    byUrl.set(incoming.url, winner);
  } else {
    byUrl.set(incoming.url, incoming);
  }
  const merged = Array.from(byUrl.values()).sort((a, b) => b.confidence - a.confidence);
  return merged.slice(0, MAX_SOURCES_PER_FACT);
}

/** Decide whether the incoming fact's value should become the new
 *  canonical, leaving the existing canonical as an alternative. The
 *  rule: higher confidence wins; ties go to the existing value to
 *  avoid flapping on equal-confidence repeats. */
function shouldReplaceCanonical(existingConfidence: number, incomingConfidence: number): boolean {
  return incomingConfidence > existingConfidence;
}

/** Move an existing canonical (with its sources) into the alternatives
 *  list. Returns the alternatives array capped at the configured max. */
function demoteToAlternatives(
  alternatives: AlternativeEntry[],
  existingValue: string,
  existingSources: SourceEntry[],
): AlternativeEntry[] {
  const normalizedExisting = normalizeValue(existingValue);
  // If this exact value is already in alternatives, merge sources instead.
  const idx = alternatives.findIndex((a) => normalizeValue(a.value) === normalizedExisting);
  if (idx >= 0) {
    const merged: SourceEntry[] = [...alternatives[idx].sources];
    for (const s of existingSources) {
      const dupIdx = merged.findIndex((m) => m.url === s.url);
      if (dupIdx < 0) merged.push(s);
    }
    const sorted = merged
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_SOURCES_PER_FACT);
    const next = [...alternatives];
    next[idx] = { value: alternatives[idx].value, sources: sorted };
    return next;
  }
  const next: AlternativeEntry[] = [
    ...alternatives,
    { value: existingValue, sources: existingSources },
  ];
  // Cap. Drop the alternative with the fewest sources (least-supported).
  if (next.length > MAX_ALTERNATIVES_PER_FACT) {
    next.sort((a, b) => b.sources.length - a.sources.length);
    return next.slice(0, MAX_ALTERNATIVES_PER_FACT);
  }
  return next;
}

/** Add an incoming source to an existing alternative bucket (the new
 *  page reported a value that was already known as an alternative). */
function appendSourceToAlternative(
  alternatives: AlternativeEntry[],
  matchValue: string,
  newSource: SourceEntry,
): AlternativeEntry[] {
  const target = normalizeValue(matchValue);
  return alternatives.map((a) => {
    if (normalizeValue(a.value) !== target) return a;
    const merged = mergeSources(a.sources, newSource);
    return { value: a.value, sources: merged };
  });
}

export async function persistFacts(
  rawFacts: Fact[],
  args: PersistArgs,
): Promise<{ inserted: number; merged: number; demoted: number }> {
  if (rawFacts.length === 0) return { inserted: 0, merged: 0, demoted: 0 };

  // 2026-05-28: derive subcategory + sourceUrl here so callers don't
  // have to. The LLM no longer produces subcategory; we map (domain,
  // factKey) → human label via the shared SUBCATEGORY_LABELS table.
  // sourceUrl falls back to the per-page URL when the model omitted it.
  const facts: FactToPersist[] = rawFacts.map((f) => ({
    ...f,
    subcategory: subcategoryFor(f.domain as Domain, f.factKey),
    sourceUrl: f.sourceUrl || args.sourceUrl,
  }));

  let inserted = 0;
  let merged = 0;
  let demoted = 0;
  for (const f of facts) {
    try {
      // Look up the existing scraped row for this (brandId, domain,
      // subcategory, factKey). The partial unique index guarantees at
      // most one. Dismissed rows are intentionally excluded — a prior
      // dismissal means the user already rejected this fact, so we
      // skip rather than reviving it.
      const existingRows = await db
        .select({
          id: schema.brandFactSheet.id,
          factValue: schema.brandFactSheet.factValue,
          confidence: schema.brandFactSheet.confidence,
          sourceUrl: schema.brandFactSheet.sourceUrl,
          sourceExcerpt: schema.brandFactSheet.sourceExcerpt,
          valuePayload: schema.brandFactSheet.valuePayload,
          dismissedAt: schema.brandFactSheet.dismissedAt,
          userOverridden: schema.brandFactSheet.userOverridden,
        })
        .from(schema.brandFactSheet)
        .where(
          and(
            eq(schema.brandFactSheet.brandId, args.brandId),
            eq(schema.brandFactSheet.domain, f.domain),
            eq(schema.brandFactSheet.subcategory, f.subcategory),
            eq(schema.brandFactSheet.factKey, f.factKey),
            eq(schema.brandFactSheet.source, "scraped"),
          ),
        )
        .limit(1);

      const existing = existingRows[0];

      // Prior dismissal — respect the user's intent and skip entirely.
      if (existing?.dismissedAt) continue;

      // 2026-05-28 Phase 4: user_overridden facts are off-limits to
      // scrapes. The user explicitly set this value; we record the
      // disagreement count but never overwrite. If the scrape produced
      // a DIFFERENT value, push it into alternatives so the user can
      // see what we found without disturbing their canonical answer.
      if (existing?.userOverridden) {
        const incomingSource: SourceEntry = {
          url: f.sourceUrl,
          excerpt: f.sourceExcerpt ?? "",
          confidence: f.confidence,
        };
        const existingPayloadUO: ValuePayload = (existing.valuePayload as ValuePayload) ?? {};
        const existingAltsUO: AlternativeEntry[] = existingPayloadUO?.alternatives ?? [];
        const normalizedIncoming = normalizeValue(f.factValue);
        const normalizedCanonical = normalizeValue(existing.factValue);
        if (normalizedIncoming !== normalizedCanonical) {
          const newAlts = appendSourceToAlternative(existingAltsUO, f.factValue, incomingSource);
          const merged =
            newAlts.length === existingAltsUO.length
              ? demoteToAlternatives(existingAltsUO, f.factValue, [incomingSource])
              : newAlts;
          await db
            .update(schema.brandFactSheet)
            .set({
              valuePayload: { ...existingPayloadUO, alternatives: merged },
              disagreementCount: sql`${schema.brandFactSheet.disagreementCount} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(schema.brandFactSheet.id, existing.id));
        }
        continue;
      }

      const incomingSource = sourceEntryFor(f);

      if (!existing) {
        // First time we see this (domain, subcategory, factKey) for
        // this brand — straight INSERT with a single-source payload.
        const valuePayload: ValuePayload = {
          ...(f.valuePayload ?? {}),
          sources: [incomingSource],
        };
        await db.insert(schema.brandFactSheet).values({
          brandId: args.brandId,
          domain: f.domain,
          subcategory: f.subcategory,
          factKey: f.factKey,
          factValue: f.factValue,
          valueType: f.valueType,
          valuePayload,
          confidence: f.confidence as never,
          sourceExcerpt: f.sourceExcerpt,
          sourceUrl: f.sourceUrl,
          source: "scraped",
          runId: args.runId,
          lastVerified: new Date(),
          schemaVersion: CURRENT_SCHEMA_VERSION,
        });
        inserted++;
        continue;
      }

      // We have an existing row. Decide:
      //   (a) Same value? → append source to canonical bucket
      //   (b) Different value, incoming higher confidence? → swap
      //       canonical; demote existing into alternatives
      //   (c) Different value, incoming lower confidence? → push
      //       incoming into alternatives (creating bucket if needed)
      const existingPayload: ValuePayload = (existing.valuePayload as ValuePayload) ?? {};
      const existingSources: SourceEntry[] = existingPayload?.sources ?? [
        // Back-fill: if this row was written by v1 (no sources array),
        // synthesise one entry from the top-level sourceUrl/excerpt
        // so we don't lose its provenance when v2 merges into it.
        {
          url: existing.sourceUrl ?? args.sourceUrl,
          excerpt: existing.sourceExcerpt ?? "",
          confidence: Number(existing.confidence) || 0,
        },
      ];
      const existingAlternatives: AlternativeEntry[] = existingPayload?.alternatives ?? [];
      const existingValueNorm = normalizeValue(existing.factValue);
      const incomingValueNorm = normalizeValue(f.factValue);

      if (existingValueNorm === incomingValueNorm) {
        // (a) Same value — just add the source.
        const mergedSources = mergeSources(existingSources, incomingSource);
        const newPayload: ValuePayload = {
          ...existingPayload,
          ...(f.valuePayload ?? {}),
          sources: mergedSources,
          alternatives: existingAlternatives.length > 0 ? existingAlternatives : undefined,
        };
        const winningConfidence = Math.max(Number(existing.confidence) || 0, f.confidence);
        await db
          .update(schema.brandFactSheet)
          .set({
            valuePayload: newPayload,
            confidence: winningConfidence as never,
            // Top-level sourceUrl/excerpt always reflects the HIGHEST-
            // confidence source so display has a single canonical
            // citation. Sources array preserves the rest.
            sourceUrl: mergedSources[0]?.url ?? existing.sourceUrl,
            sourceExcerpt: mergedSources[0]?.excerpt ?? existing.sourceExcerpt,
            runId: args.runId,
            lastVerified: new Date(),
            updatedAt: new Date(),
            schemaVersion: CURRENT_SCHEMA_VERSION,
          })
          .where(eq(schema.brandFactSheet.id, existing.id));
        merged++;
        continue;
      }

      // Values differ.
      if (shouldReplaceCanonical(Number(existing.confidence) || 0, f.confidence)) {
        // (b) Incoming wins. Demote existing canonical into alternatives.
        const newAlternatives = demoteToAlternatives(
          existingAlternatives,
          existing.factValue,
          existingSources,
        );
        const newSources = [incomingSource];
        const newPayload: ValuePayload = {
          ...existingPayload,
          ...(f.valuePayload ?? {}),
          sources: newSources,
          alternatives: newAlternatives.length > 0 ? newAlternatives : undefined,
        };
        await db
          .update(schema.brandFactSheet)
          .set({
            factValue: f.factValue,
            valueType: f.valueType,
            valuePayload: newPayload,
            confidence: f.confidence as never,
            sourceUrl: incomingSource.url,
            sourceExcerpt: incomingSource.excerpt,
            runId: args.runId,
            lastVerified: new Date(),
            updatedAt: new Date(),
            schemaVersion: CURRENT_SCHEMA_VERSION,
          })
          .where(eq(schema.brandFactSheet.id, existing.id));
        demoted++;
        continue;
      }

      // (c) Incoming loses; record it as an alternative.
      const existingAltIdx = existingAlternatives.findIndex(
        (a) => normalizeValue(a.value) === incomingValueNorm,
      );
      const newAlternatives =
        existingAltIdx >= 0
          ? appendSourceToAlternative(existingAlternatives, f.factValue, incomingSource)
          : demoteToAlternatives(existingAlternatives, f.factValue, [incomingSource]);
      const newPayload: ValuePayload = {
        ...existingPayload,
        sources: existingSources,
        alternatives: newAlternatives,
      };
      await db
        .update(schema.brandFactSheet)
        .set({
          valuePayload: newPayload,
          runId: args.runId,
          lastVerified: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.brandFactSheet.id, existing.id));
      demoted++;
    } catch (err) {
      logger.warn(
        {
          brandId: args.brandId,
          runId: args.runId,
          domain: f.domain,
          subcategory: f.subcategory,
          factKey: f.factKey,
          err,
        },
        "persistFacts: write failed (non-fatal; other facts continue)",
      );
    }
  }
  return { inserted, merged, demoted };
}
