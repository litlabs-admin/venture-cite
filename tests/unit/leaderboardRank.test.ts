// The KPI strip's "Rank" tile and the Rankings panel are the same claim shown
// twice, one directly above the other. They used to derive it separately: the
// panel sorted the leaderboard itself and said "You: #1 of 14 tracked", while
// the tile rendered a permanent `–` because it had been specced as a
// cross-account GLOBAL rank that no index exists for.
//
// Both now call rankLeaderboard(). These tests pin the ordering contract and
// the null case, so the two surfaces cannot drift apart again.

import { describe, it, expect } from "vitest";
import { rankLeaderboard, type LeaderRow } from "@/components/dashboard-panels/useDashboardData";

const row = (over: Partial<LeaderRow>): LeaderRow => ({
  name: "Acme",
  domain: "acme.com",
  isOwn: false,
  totalCitations: 0,
  shareOfVoice: 0,
  ...over,
});

describe("rankLeaderboard", () => {
  it("ranks by share of voice, descending", () => {
    const { sorted } = rankLeaderboard([
      row({ name: "Sony", shareOfVoice: 11 }),
      row({ name: "Apple", shareOfVoice: 46, isOwn: true }),
      row({ name: "Microsoft", shareOfVoice: 11 }),
      row({ name: "Dell", shareOfVoice: 2 }),
    ]);
    expect(sorted.map((r) => r.name)).toEqual(["Apple", "Sony", "Microsoft", "Dell"]);
  });

  it("reports the own brand's 1-based position and the tracked total", () => {
    // The live shape: Apple leads its own 14-row board.
    const rows = [
      row({ name: "Apple", shareOfVoice: 46, isOwn: true }),
      ...Array.from({ length: 13 }, (_, i) => row({ name: `C${i}`, shareOfVoice: 13 - i })),
    ];
    const { ownRank, tracked } = rankLeaderboard(rows);
    expect(ownRank).toBe(1);
    expect(tracked).toBe(14);
  });

  it("agrees with the position the panel renders for each row", () => {
    // The panel labels row i as #(i+1) from `sorted`; the tile shows ownRank.
    // They must be the same number for the own row.
    const rows = [
      row({ name: "Big", shareOfVoice: 60 }),
      row({ name: "Us", shareOfVoice: 30, isOwn: true }),
      row({ name: "Small", shareOfVoice: 10 }),
    ];
    const { sorted, ownRank } = rankLeaderboard(rows);
    const panelPosition = sorted.findIndex((r) => r.isOwn) + 1;
    expect(ownRank).toBe(panelPosition);
    expect(ownRank).toBe(2);
  });

  it("returns null - not 0 or 1 - when the brand has no leaderboard row", () => {
    // "Not measured", so the tile renders `–` rather than claiming a position.
    const { ownRank, tracked } = rankLeaderboard([row({ name: "Someone else" })]);
    expect(ownRank).toBeNull();
    expect(tracked).toBe(1);
  });

  it("handles an empty leaderboard", () => {
    expect(rankLeaderboard([])).toEqual({ sorted: [], ownRank: null, tracked: 0 });
  });

  it("does not mutate the caller's array", () => {
    const rows = [row({ name: "A", shareOfVoice: 1 }), row({ name: "B", shareOfVoice: 9 })];
    rankLeaderboard(rows);
    expect(rows.map((r) => r.name)).toEqual(["A", "B"]);
  });
});
