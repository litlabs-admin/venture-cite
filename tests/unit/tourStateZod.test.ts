// tests/unit/tourStateZod.test.ts
import { describe, it, expect } from "vitest";
import { applyTourStateOp } from "../../server/lib/tourStateOps";

const NOW = "2026-05-05T12:00:00.000Z";

describe("applyTourStateOp", () => {
  it("markCompleted on global-welcome writes state.global", () => {
    const out = applyTourStateOp({}, "markCompleted", {
      tourId: "global-welcome",
      version: 1,
      brandId: null,
      timestamp: NOW,
    });
    expect(out.global).toEqual({ v: 1, completedAt: NOW });
  });

  it("markCompleted on page tour with brandId writes perBrand[id][tourId]", () => {
    const out = applyTourStateOp({}, "markCompleted", {
      tourId: "mentions",
      version: 1,
      brandId: "brand-a",
      timestamp: NOW,
    });
    expect(
      (out.perBrand as Record<string, Record<string, unknown>>)["brand-a"]["mentions"],
    ).toEqual({
      v: 1,
      completedAt: NOW,
    });
  });

  it("markSkipped writes skippedAt instead of completedAt", () => {
    const out = applyTourStateOp({}, "markSkipped", {
      tourId: "mentions",
      version: 1,
      brandId: "brand-a",
      timestamp: NOW,
    });
    const record = (
      out.perBrand as Record<string, Record<string, { v: number; skippedAt: string }>>
    )["brand-a"]["mentions"];
    expect(record.skippedAt).toBe(NOW);
    expect(record).not.toHaveProperty("completedAt");
  });

  it("suppress appends tourId to perUserSuppressed; idempotent on second call", () => {
    const once = applyTourStateOp({}, "suppress", { tourId: "mentions", timestamp: NOW });
    expect(once.perUserSuppressed).toEqual(["mentions"]);
    const twice = applyTourStateOp(once, "suppress", { tourId: "mentions", timestamp: NOW });
    expect(twice.perUserSuppressed).toEqual(["mentions"]);
  });

  it("clearBrand removes perBrand[brandId] sub-tree", () => {
    const seeded = applyTourStateOp({}, "markCompleted", {
      tourId: "mentions",
      version: 1,
      brandId: "brand-a",
      timestamp: NOW,
    });
    const cleared = applyTourStateOp(seeded, "clearBrand", { brandId: "brand-a", timestamp: NOW });
    expect((cleared.perBrand as Record<string, unknown>)["brand-a"]).toBeUndefined();
  });

  it("clearBrand on missing brandId is a no-op", () => {
    const out = applyTourStateOp({ perBrand: { other: {} } }, "clearBrand", {
      brandId: "brand-a",
      timestamp: NOW,
    });
    expect(out.perBrand).toEqual({ other: {} });
  });

  it("unsuppress reverses a wildcard suppress (settings re-enable)", () => {
    const suppressed = applyTourStateOp({}, "suppress", { tourId: "*", timestamp: NOW });
    expect(suppressed.perUserSuppressed).toEqual(["*"]);
    const restored = applyTourStateOp(suppressed, "unsuppress", { tourId: "*", timestamp: NOW });
    expect(restored.perUserSuppressed).toEqual([]);
  });

  it("unsuppress removes only the matching id and is a no-op when absent", () => {
    const seeded = applyTourStateOp(
      applyTourStateOp({}, "suppress", { tourId: "mentions", timestamp: NOW }),
      "suppress",
      { tourId: "citations", timestamp: NOW },
    );
    expect(seeded.perUserSuppressed).toEqual(["mentions", "citations"]);
    const out = applyTourStateOp(seeded, "unsuppress", { tourId: "mentions", timestamp: NOW });
    expect(out.perUserSuppressed).toEqual(["citations"]);
    const noop = applyTourStateOp(out, "unsuppress", { tourId: "not-there", timestamp: NOW });
    expect(noop.perUserSuppressed).toEqual(["citations"]);
  });
});
