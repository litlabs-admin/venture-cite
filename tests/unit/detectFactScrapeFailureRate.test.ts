// Spec 2 §4.11: serial-failure detection.
// Mocks db.execute to return rows representing brands with 3 consecutive
// cron_refresh failures; verifies logger.warn + captureAndFlush fire once
// per brand and that the alerted count matches.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "test-key";
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
  process.env.SUPABASE_JWT_SECRET ??= "test-jwt-secret";
});

const stubs = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  captureAndFlush: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: { execute: stubs.dbExecute },
  pool: {},
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: stubs.captureAndFlush }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: stubs.warn, error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/advisoryLock", () => ({
  withAdvisoryLock: async (_k: number, _n: string, fn: () => Promise<unknown>) => ({
    ran: true,
    result: await fn(),
  }),
  lockKeys: { factScrapeFailureDetect: 42 },
}));

import { detectFactScrapeFailureRate } from "../../server/scheduler";

beforeEach(() => vi.clearAllMocks());

describe("detectFactScrapeFailureRate", () => {
  it("alerts once per brand with 3 consecutive failures", async () => {
    stubs.dbExecute.mockResolvedValue({
      rows: [
        {
          brand_id: "brand-A",
          error_kinds: ["all_pages_4xx", "all_pages_4xx", "robots_disallowed"],
          last_failure_at: new Date("2026-05-10T00:00:00Z"),
          all_failed: true,
          recent_count: 3,
        },
        {
          brand_id: "brand-B",
          error_kinds: ["spa_empty", "spa_empty", "spa_empty"],
          last_failure_at: new Date("2026-05-09T00:00:00Z"),
          all_failed: true,
          recent_count: 3,
        },
      ],
    });

    const { alerted } = await detectFactScrapeFailureRate();
    expect(alerted).toBe(2);
    expect(stubs.warn).toHaveBeenCalledTimes(2);
    expect(stubs.captureAndFlush).toHaveBeenCalledTimes(2);

    const firstWarn = stubs.warn.mock.calls[0][0];
    expect(firstWarn.event).toBe("fact_scrape_serial_failure");
    expect(firstWarn.brandId).toBe("brand-A");
    expect(Array.isArray(firstWarn.errorKinds)).toBe(true);

    const firstSentry = stubs.captureAndFlush.mock.calls[0][1];
    expect(firstSentry.tags.source).toBe("scheduler:detectFactScrapeFailureRate");
  });

  it("alerts zero when no brands meet the threshold", async () => {
    stubs.dbExecute.mockResolvedValue({ rows: [] });
    const { alerted } = await detectFactScrapeFailureRate();
    expect(alerted).toBe(0);
    expect(stubs.warn).not.toHaveBeenCalled();
    expect(stubs.captureAndFlush).not.toHaveBeenCalled();
  });
});
