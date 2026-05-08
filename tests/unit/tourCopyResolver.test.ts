import { describe, it, expect } from "vitest";
import { getCopy } from "../../client/src/tours/engine/copyResolver";
import type { TourContext } from "../../client/src/tours/types";

const ctx: TourContext = {
  userId: "u1",
  brandId: "b1",
  isAdmin: false,
  counts: { brands: 1, mentions: 0, citations: 0, articles: 0, prompts: 0 },
};

describe("getCopy", () => {
  it("returns string content as-is", () => {
    expect(getCopy("t", "s", "Hello", ctx)).toBe("Hello");
  });

  it("calls function content with ctx", () => {
    const fn = (c: TourContext) => `Hi ${c.userId}`;
    expect(getCopy("t", "s", fn, ctx)).toBe("Hi u1");
  });

  it("returns fallback string when function throws", () => {
    const fn = () => {
      throw new Error("boom");
    };
    expect(getCopy("t", "s", fn, ctx)).toBe("(content unavailable)");
  });

  it("returns fallback when content is undefined", () => {
    expect(getCopy("t", "s", undefined, ctx)).toBe("(content unavailable)");
  });
});
