import { describe, it, expect } from "vitest";
import {
  buildPromptScoreHistory,
  resolvePoints,
  DEFAULT_POINTS,
  type ScoreRankingRow,
} from "../../server/lib/promptScoreHistory";

// Bucketing rules this covers:
//   * score = cited / checks within one run
//   * delta compares the last two runs
//   * one run → delta null (not 0), zero runs → score null
//   * rows without a runId fall back to calendar-day buckets
//   * rows for other prompts / without a brandPromptId never leak in

const t = (iso: string) => new Date(iso);

function row(
  promptId: string | null,
  runId: string | null,
  isCited: number,
  at: string,
  rank: number | null = null,
): ScoreRankingRow {
  return { brandPromptId: promptId, runId, isCited, rank, checkedAt: t(at) };
}

describe("buildPromptScoreHistory", () => {
  it("scores each run as cited/checks and diffs the last two", () => {
    const rows = [
      // run A: 1 of 2 cited → 50
      row("p1", "runA", 1, "2026-07-01T10:00:00Z"),
      row("p1", "runA", 0, "2026-07-01T10:00:05Z"),
      // run B: 2 of 2 cited → 100
      row("p1", "runB", 1, "2026-07-08T10:00:00Z"),
      row("p1", "runB", 1, "2026-07-08T10:00:03Z"),
    ];
    const [entry] = buildPromptScoreHistory(["p1"], rows);
    expect(entry.series.map((s) => s.score)).toEqual([50, 100]);
    expect(entry.score).toBe(100);
    expect(entry.delta).toBe(50);
    expect(entry.runs).toBe(2);
  });

  it("returns null score for a prompt that never ran, and null delta after one run", () => {
    const rows = [row("p1", "runA", 1, "2026-07-01T10:00:00Z")];
    const [ran, never] = buildPromptScoreHistory(["p1", "p2"], rows);

    expect(ran.score).toBe(100);
    // One observation is a position, not a trend - must not report 0.
    expect(ran.delta).toBeNull();

    expect(never.score).toBeNull();
    expect(never.delta).toBeNull();
    expect(never.series).toEqual([]);
    expect(never.runs).toBe(0);
  });

  it("buckets rows without a runId by calendar day", () => {
    const rows = [
      row("p1", null, 1, "2026-07-01T09:00:00Z"),
      row("p1", null, 0, "2026-07-01T23:00:00Z"),
      row("p1", null, 1, "2026-07-02T09:00:00Z"),
    ];
    const [entry] = buildPromptScoreHistory(["p1"], rows);
    // Two days, not three separate "runs".
    expect(entry.runs).toBe(2);
    expect(entry.series.map((s) => s.score)).toEqual([50, 100]);
  });

  it("ignores rows belonging to other prompts or with no prompt id", () => {
    const rows = [
      row("p1", "runA", 1, "2026-07-01T10:00:00Z"),
      row("p2", "runA", 0, "2026-07-01T10:00:00Z"),
      row(null, "runA", 0, "2026-07-01T10:00:00Z"),
    ];
    const [entry] = buildPromptScoreHistory(["p1"], rows);
    expect(entry.series).toHaveLength(1);
    expect(entry.series[0].checks).toBe(1);
    expect(entry.score).toBe(100);
  });

  it("keeps only the most recent `maxPoints` runs, oldest first", () => {
    const rows: ScoreRankingRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push(row("p1", `run${i}`, i % 2, `2026-07-${String(i + 1).padStart(2, "0")}T10:00:00Z`));
    }
    const [entry] = buildPromptScoreHistory(["p1"], rows, 3);
    expect(entry.series).toHaveLength(3);
    expect(entry.runs).toBe(10);
    const times = entry.series.map((s) => new Date(s.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("drops rows with an unusable timestamp instead of bucketing them at epoch", () => {
    const rows: ScoreRankingRow[] = [
      { brandPromptId: "p1", runId: "runA", isCited: 1, rank: null, checkedAt: null },
      { brandPromptId: "p1", runId: "runB", isCited: 1, rank: null, checkedAt: "not-a-date" },
      row("p1", "runC", 1, "2026-07-01T10:00:00Z"),
    ];
    const [entry] = buildPromptScoreHistory(["p1"], rows);
    expect(entry.runs).toBe(1);
  });
});

describe("resolvePoints", () => {
  it("defaults when absent or unparseable", () => {
    expect(resolvePoints(undefined)).toBe(DEFAULT_POINTS);
    expect(resolvePoints("abc")).toBe(DEFAULT_POINTS);
  });

  it("clamps into the supported range", () => {
    expect(resolvePoints("1")).toBe(2);
    expect(resolvePoints("500")).toBe(30);
    expect(resolvePoints("14")).toBe(14);
  });
});

describe("mean rank", () => {
  it("averages real placements only and reports a slip as positive", () => {
    const rows = [
      // run A: ranks 2 and 4 → mean 3
      row("p1", "runA", 1, "2026-07-01T10:00:00Z", 2),
      row("p1", "runA", 1, "2026-07-01T10:00:01Z", 4),
      // an uncited check carries no rank and must not drag the mean to 0
      row("p1", "runA", 0, "2026-07-01T10:00:02Z", null),
      // run B: ranks 6 and 8 → mean 7
      row("p1", "runB", 1, "2026-07-08T10:00:00Z", 6),
      row("p1", "runB", 1, "2026-07-08T10:00:01Z", 8),
    ];
    const [entry] = buildPromptScoreHistory(["p1"], rows);
    expect(entry.series.map((s) => s.rank)).toEqual([3, 7]);
    expect(entry.rank).toBe(7);
    // Rank 3 → rank 7 is a slip, reported as +4.
    expect(entry.rankDelta).toBe(4);
  });

  it("has no rank or rankDelta when nothing was ranked", () => {
    const rows = [
      row("p1", "runA", 0, "2026-07-01T10:00:00Z", null),
      row("p1", "runB", 0, "2026-07-08T10:00:00Z", null),
    ];
    const [entry] = buildPromptScoreHistory(["p1"], rows);
    expect(entry.rank).toBeNull();
    expect(entry.rankDelta).toBeNull();
  });

  it("has no rankDelta when only one run produced a rank", () => {
    const rows = [
      row("p1", "runA", 0, "2026-07-01T10:00:00Z", null),
      row("p1", "runB", 1, "2026-07-08T10:00:00Z", 5),
    ];
    const [entry] = buildPromptScoreHistory(["p1"], rows);
    expect(entry.rank).toBe(5);
    expect(entry.rankDelta).toBeNull();
  });

  // The test above ("ranks 2 and 4 → mean 3", "ranks 6 and 8 → mean 7")
  // only ever averages to a whole number, so Math.round and Math.floor
  // agree on every case in this file. See
  // .audit/B6/B6b-03-mutation-metrics.md section 1.6.
  it("rounds a fractional mean to the nearest tenth rather than truncating", () => {
    // Ranks 1, 2, 2 → mean 1.6666... → ×10 = 16.666... . Math.round gives
    // 17 (→ 1.7); Math.floor gives 16 (→ 1.6). This is the one shape in
    // the file that actually separates the two rounding modes.
    const rows = [
      row("p1", "runA", 1, "2026-07-01T10:00:00Z", 1),
      row("p1", "runA", 1, "2026-07-01T10:00:01Z", 2),
      row("p1", "runA", 1, "2026-07-01T10:00:02Z", 2),
    ];
    const [entry] = buildPromptScoreHistory(["p1"], rows);
    expect(entry.series[0].rank).toBe(1.7);
    expect(entry.rank).toBe(1.7);
  });

  it("excludes a literal rank of 0 from the mean, the same as an uncited check", () => {
    // The code comment above the guard says explicitly that folding an
    // unranked check in as 0 "would flatter the average" - but every
    // existing test only ever uses `rank: null` for that case, never a
    // literal 0 (e.g. from an upstream `COALESCE(rank, 0)`). Widening
    // `r.rank > 0` to `r.rank >= 0` would pull rank 0 into the sum:
    //   guard intact:  sum=4, count=1 → mean 4
    //   guard widened: sum=4+0=4, count=2 → mean 2
    // 4 vs 2 - materially different, not a coincidental match.
    const rows = [
      row("p1", "runA", 1, "2026-07-01T10:00:00Z", 4),
      row("p1", "runA", 1, "2026-07-01T10:00:01Z", 0),
    ];
    const [entry] = buildPromptScoreHistory(["p1"], rows);
    expect(entry.rank).toBe(4);
  });
});

describe("byPlatform", () => {
  function platformRow(
    promptId: string,
    runId: string,
    platform: string,
    rank: number,
    at: string,
  ): ScoreRankingRow {
    return {
      brandPromptId: promptId,
      runId,
      aiPlatform: platform,
      isCited: 1,
      rank,
      checkedAt: t(at),
    };
  }

  // grep -n "byPlatform" tests/unit/promptScoreHistory.test.ts returned
  // nothing before this describe block - the entire field (per-model rank,
  // rank delta, and the isNew flag) had zero assertions. See
  // .audit/B6/B6b-03-mutation-metrics.md section 1.8. The audit's example
  // defect inverts BOTH `rankDelta` and `isNew` in the same edit, so this
  // input is chosen to make each one wrong in a DIFFERENT, non-cancelling
  // way: an asymmetric rank delta (2 -> 6, not e.g. 4 -> 4) so a sign flip
  // is visible, and a platform that is new in the latest run only (not
  // also present, reversed, in an earlier run) so a negated isNew is
  // visible too.
  it("reports per-platform rank, a signed delta vs the previous run, and isNew for a first-time placement", () => {
    const rows = [
      // openai: ranked in both runs, 2 -> 6 (a slip, delta should be +4 -
      // not -4, which is what the swapped `prior - latest` would produce).
      platformRow("p1", "runA", "openai", 2, "2026-07-01T10:00:00Z"),
      platformRow("p1", "runB", "openai", 6, "2026-07-08T10:00:00Z"),
      // anthropic: only ranked in the latest run - real isNew is true.
      // The audit's swapped formula (`!latest && !!prior`) would report
      // false here, since latest is NOT falsy.
      platformRow("p1", "runB", "anthropic", 9, "2026-07-08T10:00:00Z"),
    ];
    const [entry] = buildPromptScoreHistory(["p1"], rows);

    // Sorted alphabetically by platform name.
    expect(entry.byPlatform.map((p) => p.platform)).toEqual(["anthropic", "openai"]);

    const anthropic = entry.byPlatform.find((p) => p.platform === "anthropic")!;
    expect(anthropic.rank).toBe(9);
    expect(anthropic.rankDelta).toBeNull();
    expect(anthropic.isNew).toBe(true);

    const openai = entry.byPlatform.find((p) => p.platform === "openai")!;
    expect(openai.rank).toBe(6);
    expect(openai.rankDelta).toBe(4);
    expect(openai.isNew).toBe(false);
  });
});
