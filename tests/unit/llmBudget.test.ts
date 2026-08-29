import { describe, it, expect } from "vitest";
import {
  estimateCostCents,
  BudgetExceededError,
  isBudgetExceededError,
} from "../../server/lib/llmPricing";

describe("estimateCostCents", () => {
  it("uses per-1k pricing for known models", () => {
    // gpt-4o-mini: 0.015c in / 0.06c out per 1k.
    // 10k in + 5k out = 0.15 + 0.30 = 0.45c - preserved, not rounded to 0.
    expect(estimateCostCents("gpt-4o-mini", 10_000, 5_000)).toBeCloseTo(0.45, 6);
    // 1M in + 1M out = 15 + 60 = 75c
    expect(estimateCostCents("gpt-4o-mini", 1_000_000, 1_000_000)).toBe(75);
  });

  it("falls back to generic pricing for unknown models", () => {
    // FALLBACK_PRICING: 0.1c in / 0.4c out per 1k tokens.
    // 1M in + 1M out = 100 + 400 = 500c
    expect(estimateCostCents("totally-fictional-model-99", 1_000_000, 1_000_000)).toBe(500);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCostCents("gpt-4o-mini", 0, 0)).toBe(0);
  });

  it("matches by prefix when full model id includes a date", () => {
    // gpt-4o-mini-2024-07-18 should match the gpt-4o-mini pricing entry.
    expect(estimateCostCents("gpt-4o-mini-2024-07-18", 1_000_000, 1_000_000)).toBe(75);
  });

  it("handles null model gracefully", () => {
    expect(estimateCostCents(null, 1000, 1000)).toBeGreaterThan(0);
  });

  it("never returns a negative value", () => {
    // Negative inputs are nonsense but shouldn't crash.
    expect(estimateCostCents("gpt-4o-mini", -1000, -1000)).toBe(0);
  });

  it("never returns a negative value for a fractional-cent negative result", () => {
    // A negative sub-cent result must clamp to exactly 0, not to a small
    // negative float that survived the Math.max(0, ...) guard because
    // rounding happened on the wrong side of it.
    expect(estimateCostCents("google/gemini-3.1-flash-lite", -28, -935)).toBe(0);
  });

  // Regression test: the exact call shape measured in production that
  // recorded 0 for its entire history. See
  // .audit/B6/B6a-08-why-nothing-caught-it.md and
  // .audit/B6/B6a-11-cost-precision.md.
  it("does not round a single Gemini-class call to 0", () => {
    // google/gemini-3.1-flash-lite: 0.025c in / 0.15c out per 1k.
    // 28 in + 935 out = 0.0007 + 0.14025 = 0.14095c.
    const cost = estimateCostCents("google/gemini-3.1-flash-lite", 28, 935);
    expect(cost).not.toBe(0);
    expect(cost).toBeCloseTo(0.14095, 5);
  });

  // Every model from the production measurement window that recorded 0 for
  // some or all of its calls must now record a non-zero value for a
  // representative call shape (50 in / 500 out tokens - a small citation or
  // analysis call, the shape that was most distorted by the old rounding).
  it.each([
    ["google/gemini-3.1-flash-lite", 0.07625],
    ["deepseek/deepseek-v4-flash", 0.0147],
    ["perplexity/sonar", 0.055],
    ["openai/gpt-5.6-luna", 0.0305],
    ["anthropic/claude-haiku-4.5", 0.255],
  ])("produces a non-zero cost for %s at a representative call size", (model, expected) => {
    const cost = estimateCostCents(model, 50, 500);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeCloseTo(expected, 6);
  });

  it("leaves an already-non-zero, expensive call materially unchanged", () => {
    // x-ai/grok-4.3 never rounded to 0 in production (it's the most
    // expensive model in the table). A large call should still price to
    // the same magnitude as the old integer rounding produced.
    // 200,000 in + 50,000 out = 25 + 12.5 = 37.5c
    expect(estimateCostCents("x-ai/grok-4.3", 200_000, 50_000)).toBe(37.5);
  });
});

describe("BudgetExceededError", () => {
  it("is identifiable via isBudgetExceededError", () => {
    const err = new BudgetExceededError("free", 100_000, 105_000);
    expect(isBudgetExceededError(err)).toBe(true);
    expect(isBudgetExceededError(new Error("other"))).toBe(false);
    expect(isBudgetExceededError(null)).toBe(false);
    expect(isBudgetExceededError("string")).toBe(false);
  });

  it("includes tier + caps in the message for log readability", () => {
    const err = new BudgetExceededError("free", 100_000, 105_000);
    expect(err.message).toContain("free");
    expect(err.message).toContain("100,000");
    expect(err.message).toContain("105,000");
    expect(err.tier).toBe("free");
    expect(err.capTokens).toBe(100_000);
    expect(err.usedTokens).toBe(105_000);
  });
});
