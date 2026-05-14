import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbExecuteMock, dbTransactionMock, runAggregateMock, storageMock } = vi.hoisted(() => {
  const dbExecuteMock = vi.fn();
  const dbTransactionMock = vi.fn();
  const runAggregateMock = vi.fn().mockResolvedValue({
    status: "completed",
    errorKind: null,
    totalFacts: 1,
    disagreementsIncremented: 0,
  });
  const storageMock = {
    getSystemState: vi.fn().mockResolvedValue(null),
    setSystemState: vi.fn().mockResolvedValue(undefined),
    insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
  };
  return { dbExecuteMock, dbTransactionMock, runAggregateMock, storageMock };
});

vi.mock("../../server/db", () => ({
  db: {
    execute: dbExecuteMock,
    transaction: dbTransactionMock,
  },
}));
vi.mock("@shared/schema", async () => {
  const real = await vi.importActual<Record<string, unknown>>("@shared/schema");
  return real;
});

vi.mock("../../server/lib/factAgent/v2/aggregate", () => ({
  runAggregate: (...args: unknown[]) => runAggregateMock(...args),
}));

vi.mock("../../server/storage", () => ({ storage: storageMock }));

import { runFactScrapeBackstop } from "../../server/lib/factAgent/v2/factScrapeBackstop";

describe("runFactScrapeBackstop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbExecuteMock.mockResolvedValue({ rows: [] });
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        execute: dbExecuteMock,
      }),
    );
  });

  it("writes cron_last_fired_at on every tick", async () => {
    await runFactScrapeBackstop();
    expect(storageMock.setSystemState).toHaveBeenCalledWith(
      "fact_scrape_backstop_last_fired_at",
      expect.any(Object),
    );
  });

  it("does nothing when no stale runs are found", async () => {
    await runFactScrapeBackstop();
    expect(runAggregateMock).not.toHaveBeenCalled();
  });

  it("calls aggregate for each stale run found", async () => {
    let callCount = 0;
    dbExecuteMock.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return { rows: [{ id: "run-a", brand_id: "brand-a", retry_count: 2 }] };
      }
      if (callCount === 2) return { rows: [{ got: true }] };
      return { rows: [] };
    });
    await runFactScrapeBackstop();
    expect(runAggregateMock).toHaveBeenCalledTimes(1);
    expect(runAggregateMock).toHaveBeenCalledWith({ runId: "run-a", brandId: "brand-a" });
  });
});
