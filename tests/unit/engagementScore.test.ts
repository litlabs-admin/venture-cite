import { describe, it, expect } from "vitest";
import { normalizeEngagement } from "../../server/lib/engagementScore";

describe("normalizeEngagement", () => {
  it("Reddit: zero engagement = 0", () => {
    expect(normalizeEngagement("reddit", { ups: 0, comments: 0 })).toBe(0);
  });
  it("Reddit: log-scaled", () => {
    const small = normalizeEngagement("reddit", { ups: 10, comments: 2 });
    const big = normalizeEngagement("reddit", { ups: 10000, comments: 200 });
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(100);
  });
  it("HN: zero = 0", () => {
    expect(normalizeEngagement("hackernews", { points: 0, comments: 0 })).toBe(0);
  });
  it("HN: caps at 100", () => {
    expect(normalizeEngagement("hackernews", { points: 1_000_000, comments: 1_000_000 })).toBe(100);
  });
  it("Quora: returns null (not available)", () => {
    expect(normalizeEngagement("quora", {})).toBeNull();
  });
});
