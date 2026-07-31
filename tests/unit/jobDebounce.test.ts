// Guards the double-run fix.
//
// Six jobs are registered in TWO places - the in-process node-cron scheduler
// and POST /api/cron/daily-orchestrator. The advisory locks already in those
// job bodies stop two runners OVERLAPPING; they do nothing when one fires
// fifteen minutes after the other, because by then the lock is released. That
// second pass emails every user their weekly report again and re-spends on
// LLM citation and mention scans.
//
// DISABLE_IN_PROCESS_SCHEDULER is the primary fix (one owner of scheduling).
// This debounce is the belt to that braces: it holds even if both triggers
// are live, a retry fires, someone curls the endpoint, or a deploy restarts
// the process mid-window.

import { describe, it, expect, beforeEach, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  getSystemState: vi.fn(),
  setSystemState: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: { getSystemState: stubs.getSystemState, setSystemState: stubs.setSystemState },
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { shouldRunJob, markJobRan, withJobDebounce, DEBOUNCE_WINDOWS } =
  await import("../../server/lib/jobDebounce");

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  stubs.setSystemState.mockResolvedValue(undefined);
});

describe("shouldRunJob", () => {
  it("allows a job that has never run", async () => {
    stubs.getSystemState.mockResolvedValue(null);
    expect(await shouldRunJob("weekly-report", 20 * HOUR)).toMatchObject({
      shouldRun: true,
      lastRanAt: null,
    });
  });

  it("blocks a second run inside the window", async () => {
    // The exact failure: in-process cron ran an hour ago, external scheduler
    // now triggers the same job.
    stubs.getSystemState.mockResolvedValue({
      lastRanAt: new Date(Date.now() - 1 * HOUR).toISOString(),
    });
    expect((await shouldRunJob("weekly-report", 20 * HOUR)).shouldRun).toBe(false);
  });

  it("allows the next genuine run once the window has passed", async () => {
    stubs.getSystemState.mockResolvedValue({
      lastRanAt: new Date(Date.now() - 21 * HOUR).toISOString(),
    });
    expect((await shouldRunJob("weekly-report", 20 * HOUR)).shouldRun).toBe(true);
  });

  it("FAILS OPEN when the state read throws", async () => {
    // Never silently skipping is the point: a swallowed run looks exactly
    // like "the scheduler is broken", which is worse than a double run.
    stubs.getSystemState.mockRejectedValue(new Error("db down"));
    expect((await shouldRunJob("weekly-report", 20 * HOUR)).shouldRun).toBe(true);
  });

  it("treats a future timestamp as unknown rather than blocking forever", async () => {
    // Clock skew or a restored backup must not wedge a job permanently off.
    stubs.getSystemState.mockResolvedValue({
      lastRanAt: new Date(Date.now() + 5 * HOUR).toISOString(),
    });
    expect((await shouldRunJob("weekly-report", 20 * HOUR)).shouldRun).toBe(true);
  });

  it("ignores an unparseable stored timestamp", async () => {
    stubs.getSystemState.mockResolvedValue({ lastRanAt: "not-a-date" });
    expect((await shouldRunJob("weekly-report", 20 * HOUR)).shouldRun).toBe(true);
  });
});

describe("withJobDebounce", () => {
  it("runs the body and records completion on a first run", async () => {
    stubs.getSystemState.mockResolvedValue(null);
    const body = vi.fn().mockResolvedValue({ sent: 3 });

    const r = await withJobDebounce("weekly-report", 20 * HOUR, body);

    expect(body).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ran: true, result: { sent: 3 } });
    expect(stubs.setSystemState).toHaveBeenCalledWith(
      "job:weekly-report:lastRanAt",
      expect.objectContaining({ lastRanAt: expect.any(String) }),
    );
  });

  it("does NOT invoke the body when inside the window", async () => {
    stubs.getSystemState.mockResolvedValue({
      lastRanAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    });
    const body = vi.fn();

    const r = await withJobDebounce("weekly-report", 20 * HOUR, body);

    expect(body).not.toHaveBeenCalled();
    expect(r.ran).toBe(false);
  });

  it("does not record completion when the body throws", async () => {
    // A failed run must stay re-runnable - recording it would suppress the
    // retry for the whole window.
    stubs.getSystemState.mockResolvedValue(null);
    const body = vi.fn().mockRejectedValue(new Error("smtp down"));

    await expect(withJobDebounce("weekly-report", 20 * HOUR, body)).rejects.toThrow("smtp down");
    expect(stubs.setSystemState).not.toHaveBeenCalled();
  });

  it("keys state per job, so one job's run never blocks another", async () => {
    stubs.getSystemState.mockResolvedValue(null);
    await withJobDebounce("mention-scan", 20 * HOUR, async () => null);
    expect(stubs.getSystemState).toHaveBeenCalledWith("job:mention-scan:lastRanAt");
    expect(stubs.setSystemState).toHaveBeenCalledWith(
      "job:mention-scan:lastRanAt",
      expect.anything(),
    );
  });

  it("still returns the result when recording completion fails", async () => {
    // The work is already done; a failed bookkeeping write must not lose it.
    stubs.getSystemState.mockResolvedValue(null);
    stubs.setSystemState.mockRejectedValue(new Error("db down"));

    const r = await withJobDebounce("mention-scan", 20 * HOUR, async () => "ok");

    expect(r).toMatchObject({ ran: true, result: "ok" });
  });
});

describe("DEBOUNCE_WINDOWS", () => {
  it("keeps every window shorter than its job's real cadence", async () => {
    // A window at or above the cadence would swallow legitimate scheduled
    // runs - the guard is for double-fires, not for scheduling.
    expect(DEBOUNCE_WINDOWS["auto-citation"]).toBeLessThan(HOUR); // hourly job
    expect(DEBOUNCE_WINDOWS["weekly-report"]).toBeLessThan(7 * 24 * HOUR); // weekly
    expect(DEBOUNCE_WINDOWS["mention-scan"]).toBeLessThan(7 * 24 * HOUR); // weekly
  });

  it("keeps every window long enough to span a same-morning double fire", async () => {
    for (const ms of Object.values(DEBOUNCE_WINDOWS)) expect(ms).toBeGreaterThan(30 * 60 * 1000);
  });
});

describe("markJobRan", () => {
  it("writes an ISO timestamp under the job's key", async () => {
    const at = new Date("2026-07-31T02:00:00.000Z");
    await markJobRan("auto-citation", at);
    expect(stubs.setSystemState).toHaveBeenCalledWith("job:auto-citation:lastRanAt", {
      lastRanAt: "2026-07-31T02:00:00.000Z",
    });
  });
});
