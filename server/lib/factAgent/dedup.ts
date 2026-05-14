// Spec 2 §4.2 Phase 2 step 8: within-run dedup. The LLM may extract the
// same (domain, subcategory, factKey) from two pages (e.g. tagline on
// /home and /about). Keep highest confidence; preserve the rest under
// valuePayload.alternatives so the diff view can show them on demand.

import type { ExtractedFact } from "./types";

export function dedupWithinRun(facts: ExtractedFact[]): ExtractedFact[] {
  const groups = new Map<string, ExtractedFact[]>();
  for (const f of facts) {
    const key = `${f.domain}::${f.subcategory}::${f.factKey}`;
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }
  const out: ExtractedFact[] = [];
  for (const arr of Array.from(groups.values())) {
    arr.sort((a, b) => b.confidence - a.confidence);
    const winner = arr[0];
    if (arr.length === 1) {
      out.push(winner);
    } else {
      const alternatives = arr.slice(1).map((a) => ({
        factValue: a.factValue,
        confidence: a.confidence,
        sourceUrl: a.sourceUrl,
        sourceExcerpt: a.sourceExcerpt,
      }));
      const merged: ExtractedFact = {
        ...winner,
        valuePayload: {
          ...(winner.valuePayload ?? {}),
          alternatives,
        },
      };
      out.push(merged);
    }
  }
  return out;
}
