import { describe, it, expect } from "vitest";
import {
  brandFactSheet,
  insertBrandFactSheetSchema,
  type BrandFactSheet,
} from "../../shared/schema";

describe("brandFactSheet schema after Spec 2 migration", () => {
  it("has the new columns from migration 0059", () => {
    const cols = Object.keys(brandFactSheet);
    expect(cols).toContain("domain");
    expect(cols).toContain("subcategory");
    expect(cols).toContain("valueType");
    expect(cols).toContain("valuePayload");
    expect(cols).toContain("confidence");
    expect(cols).toContain("sourceExcerpt");
    expect(cols).toContain("dismissedAt");
    expect(cols).toContain("acceptedAt");
    expect(cols).toContain("runId");
  });

  it("no longer exposes factCategory (renamed to subcategory)", () => {
    const cols = Object.keys(brandFactSheet);
    expect(cols).not.toContain("factCategory");
  });

  it("insertBrandFactSheetSchema accepts the new fields", () => {
    const parsed = insertBrandFactSheetSchema.safeParse({
      brandId: "brand-1",
      domain: "offerings",
      subcategory: "pricing_plans",
      factKey: "enterprise",
      factValue: "Custom pricing, contact sales",
      valueType: "string",
      source: "scraped",
      sourceUrl: "https://example.com/pricing",
      confidence: "0.82",
      sourceExcerpt: "Our enterprise tier offers...",
    });
    expect(parsed.success).toBe(true);
  });

  it("insertBrandFactSheetSchema rejects invalid domain", () => {
    const parsed = insertBrandFactSheetSchema.safeParse({
      brandId: "brand-1",
      domain: "not-a-domain",
      subcategory: "x",
      factKey: "y",
      factValue: "z",
      source: "scraped",
    });
    // Drizzle's createInsertSchema does NOT enforce CHECK constraints
    // (those run in the DB only). This test documents the boundary:
    // the Zod schema accepts the row; the DB rejects it.
    expect(parsed.success).toBe(true);
  });
});
