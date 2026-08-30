import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, loggerMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({
  db: {},
  pool: { query: queryMock },
}));
vi.mock("../../server/lib/logger", () => ({
  logger: loggerMock,
}));

import { withJobLease } from "../../server/lib/advisoryLock";

function queryCallAt(index: number) {
  const call = queryMock.mock.calls[index];
  if (!call) throw new Error(`Expected query call ${index + 1}`);
  return call;
}

beforeEach(() => {
  queryMock.mockReset();
  loggerMock.info.mockReset();
  loggerMock.warn.mockReset();
  loggerMock.error.mockReset();
  loggerMock.debug.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withJobLease", () => {
  it("runs the callback and returns its value when it acquires a free lease", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ holder_token: "holder" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const fn = vi.fn(async () => "completed");

    await expect(withJobLease("daily-report", 90, fn)).resolves.toBe("completed");

    expect(fn).toHaveBeenCalledOnce();
    expect(queryMock).toHaveBeenCalledTimes(2);
    const [acquireSql, acquireValues] = queryCallAt(0);
    expect(acquireSql).toMatch(/insert into job_leases/i);
    expect(acquireSql).toMatch(/on conflict \(lease_key\) do update/i);
    expect(acquireValues).toEqual(["daily-report", expect.any(String), "90 seconds"]);
  });

  it("returns null without running the callback when another holder owns the lease", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const fn = vi.fn(async () => "should not run");

    await expect(withJobLease("daily-report", 90, fn)).resolves.toBeNull();

    expect(fn).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledOnce();
  });

  it("takes over an expired lease with the atomic conflict update", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ holder_token: "new-holder" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(withJobLease("daily-report", 90, async () => "completed")).resolves.toBe(
      "completed",
    );

    const [acquireSql] = queryCallAt(0);
    expect(acquireSql).toMatch(/where job_leases\.expires_at < now\(\)/i);
  });

  it("releases only the lease row held by this caller", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ holder_token: "holder" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });

    await withJobLease("brand:123", 90, async () => "completed");

    const [, acquireValues] = queryCallAt(0);
    const [releaseSql, releaseValues] = queryCallAt(1);
    expect(releaseSql).toMatch(
      /delete from job_leases where lease_key = \$1 and holder_token = \$2/i,
    );
    expect(releaseValues).toEqual(["brand:123", acquireValues[1]]);
  });

  it("releases the lease and propagates a callback error", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ holder_token: "holder" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const failure = new Error("job failed");

    await expect(
      withJobLease("daily-report", 90, async () => Promise.reject(failure)),
    ).rejects.toBe(failure);

    expect(queryCallAt(1)[0]).toMatch(/delete from job_leases/i);
  });

  it("clears the renewal timer when the callback finishes", async () => {
    vi.useFakeTimers();
    queryMock.mockResolvedValueOnce({ rows: [{ holder_token: "holder" }] });
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    let resolveJob: (value: string) => void = () => {
      throw new Error("Expected the callback to start");
    };
    const job = new Promise<string>((resolve) => {
      resolveJob = resolve;
    });
    const fn = vi.fn(() => job);

    const result = withJobLease("daily-report", 9, fn);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryCallAt(1)[0]).toMatch(/update job_leases/i);
    resolveJob("completed");

    await expect(result).resolves.toBe("completed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops renewing and logs when a renewal discovers the lease was lost", async () => {
    // Simulates another holder taking over an expired lease between our
    // acquire and our next heartbeat: the renewal UPDATE is scoped to
    // `lease_key = $1 AND holder_token = $2`, so it matches zero rows once
    // someone else owns the row. Real code must notice (rowCount !== 1),
    // stop its own renewal timer, and warn - otherwise it keeps sending
    // no-op UPDATEs forever and never signals the loss.
    vi.useFakeTimers();
    queryMock.mockResolvedValueOnce({ rows: [{ holder_token: "holder" }] }); // acquire
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // renewal loses the race
    queryMock.mockResolvedValueOnce({ rows: [] }); // release on the way out
    let resolveJob: (value: string) => void = () => {
      throw new Error("Expected the callback to start");
    };
    const job = new Promise<string>((resolve) => {
      resolveJob = resolve;
    });
    const fn = vi.fn(() => job);

    const result = withJobLease("daily-report", 9, fn);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledOnce();

    // First renewal tick (~3s in): loses the lease.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { leaseKey: "daily-report" },
      "job-lease: lease lost while renewing",
    );

    // The renewal timer must actually be cleared - advancing well past
    // several more intervals must not produce another renewal attempt.
    await vi.advanceTimersByTimeAsync(9_000);
    expect(queryMock).toHaveBeenCalledTimes(2);

    resolveJob("completed");
    await expect(result).resolves.toBe("completed");

    // The callback's own result still comes through - loss detection does
    // not cancel in-flight work, it only stops pretending the lease is
    // still held - and release still fires unconditionally on the way out.
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(queryCallAt(2)[0]).toMatch(/delete from job_leases/i);
  });
});
