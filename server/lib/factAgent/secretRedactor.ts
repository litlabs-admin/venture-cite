// Spec 2 §4.8.2: drop facts whose factValue or valuePayload items contain
// a recognised secret pattern. Logs the pattern that matched, never the
// matched bytes themselves.

import type { ExtractedFact } from "./types";
import { logger } from "../logger";

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "stripe", re: /sk_(live|test)_[A-Za-z0-9]{20,}/ },
  { name: "aws", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "github_ghp", re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: "github_gho", re: /\bgho_[A-Za-z0-9]{36}\b/ },
  { name: "slack", re: /\bxox[bsoa]-[A-Za-z0-9-]{10,}\b/ },
  { name: "jwt", re: /\beyJ[A-Za-z0-9._-]{20,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/ },
  { name: "private_key", re: /-----BEGIN ((RSA|EC|DSA|OPENSSH) )?PRIVATE KEY-----/ },
];

function containsSecret(s: string): string | null {
  for (const p of PATTERNS) if (p.re.test(s)) return p.name;
  return null;
}

export function redactSecretsFromFacts(facts: ExtractedFact[]): {
  kept: ExtractedFact[];
  dropped: number;
} {
  const kept: ExtractedFact[] = [];
  let dropped = 0;
  for (const f of facts) {
    let hit = containsSecret(f.factValue);
    if (!hit && f.valuePayload && Array.isArray((f.valuePayload as { items?: unknown[] }).items)) {
      for (const item of (f.valuePayload as { items: unknown[] }).items) {
        if (typeof item === "string") {
          const h = containsSecret(item);
          if (h) {
            hit = h;
            break;
          }
        }
      }
    }
    if (hit) {
      logger.warn(
        { domain: f.domain, subcategory: f.subcategory, factKey: f.factKey, pattern: hit },
        "factAgent.redactor: dropped fact (secret pattern)",
      );
      dropped++;
      continue;
    }
    kept.push(f);
  }
  return { kept, dropped };
}
