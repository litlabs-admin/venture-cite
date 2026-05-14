// Spec 2 §4.8.1: drop facts whose key or value contains prompt-injection
// markers. Conservative — false positives are cheap (one missing fact) and
// false negatives are expensive (a tampered fact ends up in the brand
// fact sheet, then in downstream content generation prompts).

import type { ExtractedFact } from "./types";
import { logger } from "../logger";

const INJECTION_PATTERNS: RegExp[] = [
  /ignore previous/i,
  /\bsystem\s*:/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /\bassistant\s*:/i,
  /\bdisregard (the )?(above|prior|previous)/i,
  /you (are now|must) (a |an )?/i,
];

// A factKey should be a short snake_case identifier. If it has whitespace,
// colons, or looks like JSON, treat as injected.
const FACTKEY_BAD = /[\s:{}\[\]"]|^[A-Z]/;

export function sanitizeFactsForInjection(facts: ExtractedFact[]): {
  kept: ExtractedFact[];
  dropped: number;
} {
  const kept: ExtractedFact[] = [];
  let dropped = 0;
  for (const f of facts) {
    if (FACTKEY_BAD.test(f.factKey) || INJECTION_PATTERNS.some((p) => p.test(f.factKey))) {
      logger.warn(
        {
          domain: f.domain,
          subcategory: f.subcategory,
          factKey: f.factKey,
          reason: "factKey_injection",
        },
        "factAgent.sanitizer: dropped fact (factKey injection)",
      );
      dropped++;
      continue;
    }
    if (INJECTION_PATTERNS.some((p) => p.test(f.factValue))) {
      logger.warn(
        {
          domain: f.domain,
          subcategory: f.subcategory,
          factKey: f.factKey,
          reason: "factValue_injection",
        },
        "factAgent.sanitizer: dropped fact (factValue injection)",
      );
      dropped++;
      continue;
    }
    kept.push(f);
  }
  return { kept, dropped };
}
