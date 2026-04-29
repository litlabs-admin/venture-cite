// Wave 9.4: shared loader for BOFU + FAQ generation prompts. Pulls the
// brand row, the active fact sheet, and tracked competitor records for
// every name in `comparedWith`, so the LLM can be grounded against real
// facts instead of hallucinating from training data.
//
// The previous BOFU/FAQ generators sent only `brand.name` + `industry`
// + `description` + `products[]`. With no facts and only `comparedWith[0]`
// fed into the prompt, the LLM invented competitor features and pricing.
// This module is the single point that prompt builders consult.

import type { Brand, BrandFactSheet, Competitor } from "@shared/schema";
import { storage } from "../storage";

export interface BrandGenerationContext {
  brand: Brand;
  facts: BrandFactSheet[];
  // For every name in `comparedWith`, the matching tracked competitor
  // (case-insensitive on `name`) if one exists, else `null`. Order
  // matches the input `comparedWith` array so prompt builders can keep
  // user intent.
  competitorsResolved: { name: string; tracked: Competitor | null }[];
}

export async function loadBrandGenerationContext(
  brandId: string,
  comparedWith: string[] = [],
): Promise<BrandGenerationContext | null> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) return null;

  const [facts, trackedAll] = await Promise.all([
    storage.getBrandFacts(brandId).catch(() => [] as BrandFactSheet[]),
    storage.getCompetitors(brandId).catch(() => [] as Competitor[]),
  ]);

  // Case-insensitive lookup so "Salesforce" / "salesforce" / "SALESFORCE"
  // all bind to the same tracked row.
  const trackedByName = new Map<string, Competitor>();
  for (const c of trackedAll) {
    if (c?.name) trackedByName.set(c.name.toLowerCase(), c);
  }

  const competitorsResolved = comparedWith.map((raw) => {
    const name = String(raw ?? "").trim();
    if (!name) return { name, tracked: null };
    const tracked = trackedByName.get(name.toLowerCase()) ?? null;
    return { name, tracked };
  });

  return { brand, facts, competitorsResolved };
}

/**
 * Render the brand's verified-fact block for inclusion in a generation
 * prompt. Returns an empty string when there are no facts so the prompt
 * stays clean. Fact text is truncated per-row at 500 chars to bound the
 * context window.
 */
export function renderFactsBlock(facts: BrandFactSheet[]): string {
  if (!facts.length) return "";
  const lines = facts.slice(0, 30).map((f) => {
    const value = String(f.factValue ?? "")
      .slice(0, 500)
      .trim();
    return `- [${f.factCategory}] ${f.factKey}: ${value}`;
  });
  return [
    "Verified facts about this brand. The model MUST use these and MUST NOT contradict them.",
    'If a claim is not in this list, hedge with phrases like "commonly reported as" or omit.',
    ...lines,
  ].join("\n");
}

/**
 * Render the resolved-competitor block. Tracked competitors get their
 * description / industry / domain inlined so the LLM has actual facts to
 * compare against; freeform names get a "(no verified facts available)"
 * tag so the LLM hedges rather than inventing details.
 */
export function renderCompetitorBlock(
  resolved: { name: string; tracked: Competitor | null }[],
): string {
  if (!resolved.length) return "";
  const lines = resolved.map(({ name, tracked }) => {
    if (!tracked) {
      return `- ${name} — (no verified facts available; hedge or omit specific claims about this competitor)`;
    }
    const parts: string[] = [];
    if (tracked.industry) parts.push(`industry: ${tracked.industry}`);
    if (tracked.domain) parts.push(`domain: ${tracked.domain}`);
    if (tracked.description) {
      parts.push(`description: ${String(tracked.description).slice(0, 400)}`);
    }
    const meta = parts.length ? ` — ${parts.join("; ")}` : "";
    return `- ${tracked.name}${meta}`;
  });
  return ["Competitors to compare against:", ...lines].join("\n");
}
