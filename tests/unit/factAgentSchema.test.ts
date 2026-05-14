import { describe, it, expect } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  FactSchema,
  FactsResponseSchema,
  DOMAINS,
} from "../../shared/factAgent/schema";

describe("factAgent canonical schema", () => {
  it("exposes CURRENT_SCHEMA_VERSION as a positive integer", () => {
    expect(Number.isInteger(CURRENT_SCHEMA_VERSION)).toBe(true);
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("lists the 8 canonical domains", () => {
    expect(DOMAINS).toEqual([
      "identity",
      "offerings",
      "positioning",
      "team",
      "operations",
      "credentials",
      "growth",
      "contact",
    ]);
  });

  it("accepts a well-formed fact", () => {
    const ok = FactSchema.safeParse({
      domain: "identity",
      subcategory: "description",
      factKey: "tagline",
      factValue: "We build AI tools.",
      valueType: "string",
      valuePayload: null,
      confidence: 0.9,
      sourceExcerpt: "We build AI tools for everyone.",
      sourceUrl: "https://example.com",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects an out-of-range confidence", () => {
    const bad = FactSchema.safeParse({
      domain: "identity",
      subcategory: "x",
      factKey: "y",
      factValue: "z",
      valueType: "string",
      confidence: 1.5,
      sourceExcerpt: "",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an unknown domain", () => {
    const bad = FactSchema.safeParse({
      domain: "marketing",
      subcategory: "x",
      factKey: "y",
      factValue: "z",
      valueType: "string",
      confidence: 0.5,
      sourceExcerpt: "",
    });
    expect(bad.success).toBe(false);
  });

  it("FactsResponseSchema requires a facts array", () => {
    expect(FactsResponseSchema.safeParse({ facts: [] }).success).toBe(true);
    expect(FactsResponseSchema.safeParse({}).success).toBe(false);
  });
});
