// Listicles panel summary — replaced the "Conversations" placeholder, and now
// sits in the dashboard's bottom row beside Citations and Hallucinations.
//
// Two things here are easy to get wrong, and both would show a confidently
// wrong number on the dashboard:
//
//  1. `is_included` is an INTEGER column (0/1), not a boolean. Testing it for
//     truthiness instead of `=== 1` counts every scanned roundup as one you
//     appear in — for the Apple brand that turns a real 17 into 22.
//  2. `list_position` is nullable. Averaging with missing positions treated as
//     0 drags the average toward an impossibly good rank.

import { describe, it, expect } from "vitest";
import { summariseListicles } from "@/components/dashboard-panels/ListiclesPanel";
import type { Listicle } from "@/components/dashboard-panels/useDashboardData";

const row = (over: Partial<Listicle>): Listicle => ({
  id: Math.random().toString(36).slice(2),
  title: "Best smartphones",
  url: "https://example.com/best",
  sourcePublication: "example.com",
  listPosition: null,
  totalListItems: 10,
  isIncluded: 0,
  lastChecked: "2026-07-27T06:14:57.500Z",
  ...over,
});

describe("summariseListicles", () => {
  it("counts only rows whose isIncluded is exactly 1", () => {
    const rows = [
      row({ isIncluded: 1, listPosition: 1 }),
      row({ isIncluded: 1, listPosition: 3 }),
      row({ isIncluded: 0, listPosition: 2 }),
    ];
    const s = summariseListicles(rows);
    expect(s.total).toBe(3);
    expect(s.included).toBe(2);
  });

  it("averages position over ranked rows only, ignoring nulls", () => {
    // Live shape: 17 included of 22, but only 14 carry a position.
    const rows = [
      row({ isIncluded: 1, listPosition: 1 }),
      row({ isIncluded: 1, listPosition: 2 }),
      row({ isIncluded: 1, listPosition: null }),
    ];
    // (1 + 2) / 2 = 1.5 — NOT (1 + 2 + 0) / 3 = 1.
    expect(summariseListicles(rows).avgPosition).toBe(1.5);
  });

  it("returns null, not 0, when no included row carries a position", () => {
    const s = summariseListicles([row({ isIncluded: 1, listPosition: null })]);
    expect(s.avgPosition).toBeNull();
    expect(s.included).toBe(1);
  });

  it("never counts an excluded row's position toward the average", () => {
    const s = summariseListicles([
      row({ isIncluded: 1, listPosition: 4 }),
      row({ isIncluded: 0, listPosition: 1 }),
    ]);
    expect(s.avgPosition).toBe(4);
  });

  it("orders the top list by position, unranked last", () => {
    const rows = [
      row({ isIncluded: 1, listPosition: null, sourcePublication: "no-rank.com" }),
      row({ isIncluded: 1, listPosition: 3, sourcePublication: "third.com" }),
      row({ isIncluded: 1, listPosition: 1, sourcePublication: "first.com" }),
      row({ isIncluded: 0, listPosition: 1, sourcePublication: "excluded.com" }),
    ];
    expect(summariseListicles(rows).top.map((r) => r.sourcePublication)).toEqual([
      "first.com",
      "third.com",
      "no-rank.com",
    ]);
  });

  it("handles a brand that has been scanned and found in nothing", () => {
    const s = summariseListicles([row({ isIncluded: 0 }), row({ isIncluded: 0 })]);
    expect(s).toMatchObject({ total: 2, included: 0, avgPosition: null });
    expect(s.top).toEqual([]);
  });
});
