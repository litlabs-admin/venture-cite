import { describe, it, expect } from "vitest";
import { validateFact } from "../../server/lib/factAgent/validators";
import type { ExtractedFact } from "../../server/lib/factAgent/types";

const numFact = (factKey: string, n: number): ExtractedFact => ({
  domain: "growth",
  subcategory: "milestones",
  factKey,
  factValue: String(n),
  valueType: "number",
  valuePayload: { n },
  confidence: 0.9,
  sourceExcerpt: "",
  sourceUrl: "https://x.com",
});

const stringFact = (factKey: string, v: string): ExtractedFact => ({
  domain: "contact",
  subcategory: "channels",
  factKey,
  factValue: v,
  valueType: "string",
  valuePayload: null,
  confidence: 0.9,
  sourceExcerpt: "",
  sourceUrl: "https://x.com",
});

describe("validateFact", () => {
  it("accepts founding_year in [1700,2030]", () => {
    expect(validateFact(numFact("founding_year", 1999)).ok).toBe(true);
  });
  it("rejects founding_year=1500", () => {
    const v = validateFact(numFact("founding_year", 1500));
    expect(v.ok).toBe(false);
  });
  it("rejects founding_year=3000", () => {
    expect(validateFact(numFact("founding_year", 3000)).ok).toBe(false);
  });

  it("accepts employee_count=0", () => {
    expect(validateFact(numFact("employee_count", 0)).ok).toBe(true);
  });
  it("rejects employee_count=-1", () => {
    expect(validateFact(numFact("employee_count", -1)).ok).toBe(false);
  });
  it("rejects employee_count > 1M", () => {
    expect(validateFact(numFact("employee_count", 2_000_000)).ok).toBe(false);
  });

  it("accepts funding_amount_usd=50_000_000", () => {
    expect(validateFact(numFact("funding_amount_usd", 50_000_000)).ok).toBe(true);
  });
  it("rejects funding_amount_usd=0", () => {
    expect(validateFact(numFact("funding_amount_usd", 0)).ok).toBe(false);
  });
  it("rejects funding_amount_usd=1e12", () => {
    expect(validateFact(numFact("funding_amount_usd", 1e12)).ok).toBe(false);
  });

  it("accepts E.164 phone", () => {
    expect(validateFact(stringFact("phone", "+14155551234")).ok).toBe(true);
  });
  it("rejects non-E.164 phone", () => {
    expect(validateFact(stringFact("phone", "415-555-1234")).ok).toBe(false);
  });

  it("accepts simple email", () => {
    expect(validateFact(stringFact("email", "hi@example.com")).ok).toBe(true);
  });
  it("rejects garbage email", () => {
    expect(validateFact(stringFact("email", "not-an-email")).ok).toBe(false);
  });

  it("accepts unknown factKeys without enforcing any per-key rule", () => {
    expect(validateFact(stringFact("tagline", "make things better")).ok).toBe(true);
  });
});
