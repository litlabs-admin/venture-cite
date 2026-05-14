// Spec 2 §4.2 Phase 2 step 7: per-key validators. Unknown factKeys pass
// through unchanged (LLM is free to pick any snake_case subcategory).

import type { ExtractedFact } from "./types";

type Result = { ok: true } | { ok: false; reason: string };

function int(payload: ExtractedFact["valuePayload"]): number | null {
  if (!payload || typeof (payload as { n?: unknown }).n !== "number") return null;
  const n = (payload as { n: number }).n;
  return Number.isInteger(n) ? n : null;
}

const E164 = /^\+[1-9]\d{6,14}$/;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function validateFact(fact: ExtractedFact): Result {
  switch (fact.factKey) {
    case "founding_year": {
      const n = int(fact.valuePayload);
      if (n === null) return { ok: false, reason: "founding_year not integer" };
      if (n < 1700 || n > 2030) return { ok: false, reason: "founding_year out of range" };
      return { ok: true };
    }
    case "employee_count": {
      const n = int(fact.valuePayload);
      if (n === null) return { ok: false, reason: "employee_count not integer" };
      if (n < 0 || n > 1_000_000) return { ok: false, reason: "employee_count out of range" };
      return { ok: true };
    }
    case "funding_amount_usd": {
      const n = int(fact.valuePayload);
      if (n === null) return { ok: false, reason: "funding_amount_usd not integer" };
      if (n <= 0 || n >= 100_000_000_000)
        return { ok: false, reason: "funding_amount_usd out of range" };
      return { ok: true };
    }
    case "phone": {
      if (!E164.test(fact.factValue.trim())) return { ok: false, reason: "phone not E.164" };
      return { ok: true };
    }
    case "email": {
      if (!EMAIL.test(fact.factValue.trim())) return { ok: false, reason: "email invalid" };
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}
