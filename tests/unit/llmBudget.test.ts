import { describe, it, expect } from "vitest";
import {
  estimateCostCents,
  BudgetExceededError,
  isBudgetExceededError,
} from "../../server/lib/llmPricing";

describe("estimateCostCents", () => {
  it("uses per-1k pricing for known models", () => {
    // gpt-4o-mini: 0.015c in / 0.06c out per 1k.
    // 10k in + 5k out = 0.15 + 0.30 = 0.45c → rounds to 0
    expect(estimateCostCents("gpt-4o-mini", 10_000, 5_000)).toBe(0);
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
