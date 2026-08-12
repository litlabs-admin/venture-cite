// Push verified fact-sheet values back onto the `brands` row.
//
// Until this existed, the fact sheet was write-only as far as the brand
// profile was concerned: the scraper learned that a company sells enterprise
// AI voice agents, wrote that to brand_fact_sheet, and the brands row kept
// saying "Technology" forever. That string is not cosmetic - it is fed back
// into fact extraction as the industry hint, into competitor discovery as the
// market, and into prompt generation as the category. One bad first guess
// therefore poisoned every later stage, permanently, unless a human noticed.
//
// The gate below is the whole design: this function fills gaps and repairs
// generic labels. It never overwrites a specific value, even one sourced
// from a user-entered fact - a later paste import can be wrong, and a
// human-confirmed brand field must stay put until a human changes it.
import { storage } from "../../../storage";
import { logger } from "../../logger";
import { isGenericIndustry } from "../../genericIndustry";
import type { BrandFactSheet } from "@shared/schema";

// Below this the fact is a guess, and a guess is what we are replacing.
const MIN_CONFIDENCE = 0.7;

type FactKey = `${string}/${string}`;

function keyOf(f: BrandFactSheet): FactKey {
  return `${f.domain}/${f.factKey}`;
}

/** First fact matching any key, in preference order, that clears the confidence bar. */
function pick(facts: BrandFactSheet[], keys: FactKey[]): BrandFactSheet | null {
  for (const key of keys) {
    const hit = facts.find(
      (f) => keyOf(f) === key && (Number(f.confidence) || 0) >= MIN_CONFIDENCE && f.factValue,
    );
    if (hit) return hit;
  }
  return null;
}

function valuesOf(f: BrandFactSheet): string[] {
  const items = (f.valuePayload as { items?: unknown[] } | null)?.items;
  if (f.valueType === "array" && Array.isArray(items)) {
    return items.map((x) => String(x).trim()).filter(Boolean);
  }
  return [String(f.factValue).trim()].filter(Boolean);
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  return String(v).trim().length === 0;
}

/**
 * Reconcile the brands row against the verified fact sheet.
 *
 * Returns the names of the columns written - empty when nothing was due,
 * which is the common case for a brand whose profile a human has curated.
 * Never throws: this runs after the scrape's terminal-status write and must
 * not be able to disturb it.
 */
export async function applyFactSheetToBrand(brandId: string, runId: string): Promise<string[]> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) return [];

  // getBrandFacts already collapses duplicates with the precedence
  // user_manual > user > scraped > paste, so a hand-entered fact wins here
  // for free.
  const facts = await storage.getBrandFacts(brandId);
  if (facts.length === 0) return [];

  const patch: Record<string, unknown> = {};

  // industry - the field this whole file exists for. productCategory first:
  // it is the buyer-facing category label, which is what every consumer of
  // this string actually wants.
  const industryFact = pick(facts, ["offerings/productCategory", "identity/industry"]);
  if (industryFact) {
    const value = String(industryFact.factValue).trim().slice(0, 120);
    const currentIsWeak = isEmpty(brand.industry) || isGenericIndustry(brand.industry);
    // Never trade one generic label for another, and never overwrite a
    // specific value - not even with a user-sourced fact.
    if (currentIsWeak && !isGenericIndustry(value)) {
      patch.industry = value;
    }
  }

  const descFact = pick(facts, [
    "identity/description",
    "positioning/valueProposition",
    "identity/tagline",
  ]);
  if (descFact) {
    const value = String(descFact.factValue).trim().slice(0, 2000);
    // A terse description is still a chosen one - only fill a true gap.
    if (value.length >= 60 && isEmpty(brand.description)) {
      patch.description = value;
    }
  }

  const audienceFact = pick(facts, ["positioning/targetAudience"]);
  if (audienceFact) {
    const value = String(audienceFact.factValue).trim().slice(0, 500);
    if (isEmpty(brand.targetAudience)) {
      patch.targetAudience = value;
    }
  }

  if (isEmpty(brand.products)) {
    const productKeys: FactKey[] = [
      "offerings/productLine",
      "offerings/primaryProduct",
      "offerings/primaryService",
      "offerings/subProducts",
    ];
    const seen = new Set<string>();
    const products: string[] = [];
    for (const f of facts) {
      if (!productKeys.includes(keyOf(f))) continue;
      if ((Number(f.confidence) || 0) < MIN_CONFIDENCE) continue;
      for (const raw of valuesOf(f)) {
        const value = raw.slice(0, 120);
        const dedupKey = value.toLowerCase();
        if (seen.has(dedupKey) || products.length >= 20) continue;
        seen.add(dedupKey);
        products.push(value);
      }
    }
    if (products.length > 0) patch.products = products;
  }

  const fields = Object.keys(patch);
  // No empty version bumps - a no-op write would still invalidate any
  // optimistic lock the brand page is holding.
  if (fields.length === 0) return [];

  const updated = await storage.updateBrandIfVersion(brandId, brand.version, patch as never);
  if (!updated) {
    // The user was editing this brand at the same moment. Their edit wins;
    // the next scrape re-checks anyway.
    logger.info({ brandId, runId, fields }, "factWriteBack: version conflict, deferred");
    return [];
  }

  logger.info(
    { brandId, runId, fields, patch },
    "factWriteBack: corrected brand profile from fact sheet",
  );
  return fields;
}
