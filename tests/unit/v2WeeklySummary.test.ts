import { describe, it, expect, vi } from "vitest";

const dbExecuteMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/db", () => ({ db: { execute: dbExecuteMock } }));

const loggerMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("../../server/lib/logger", () => ({ logger: loggerMock }));

import { runWeeklySummary } from "../../server/lib/factAgent/v2/weeklySummary";

describe("runWeeklySummary", () => {
  it("queries fact_scrape_logs and emits a single info log with the summary", async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        {
          source: "static_pages",
          total_runs: 10,
          done_runs: 7,
          failed_runs: 2,
          skipped_runs: 1,
          total_facts: 35,
          avg_latency_ms: 1200,
        },
        {
          source: "search_llm",
          total_runs: 10,
          done_runs: 8,
          failed_runs: 2,
          skipped_runs: 0,
          total_facts: 22,
          avg_latency_ms: 4500,
        },
        {
          source: "user_enrich",
          total_runs: 10,
          done_runs: 10,
          failed_runs: 0,
          skipped_runs: 0,
          total_facts: 40,
          avg_latency_ms: 800,
        },
      ],
    });
    dbExecuteMock.mockResolvedValueOnce({
      rows: [
        { error_kind: "llm_unavailable", count: 3 },
        { error_kind: "fetch_failed", count: 1 },
      ],
    });
    dbExecuteMock.mockResolvedValueOnce({
      rows: [{ brand_id: "brand-a", empty_run_count: 4 }],
    });

    const result = await runWeeklySummary();

    expect(result.sources.length).toBe(3);
    expect(result.topErrorKinds).toHaveLength(2);
    expect(result.consistentlyEmptyBrands).toHaveLength(1);
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "fact_scrape_v2_weekly_summary" }),
      expect.any(String),
    );
  });

  it("handles an empty week without error", async () => {
    dbExecuteMock.mockResolvedValue({ rows: [] });
    const result = await runWeeklySummary();
    expect(result.sources).toEqual([]);
    expect(result.topErrorKinds).toEqual([]);
    expect(result.consistentlyEmptyBrands).toEqual([]);
  });
});
