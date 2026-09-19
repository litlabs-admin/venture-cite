// Coverage for server/onboardingSession/cleanup.ts - the scheduled sweep
// wrapper mirrors server/lib/tourCleanup.ts: call the store's delete, log
// the count. The store function itself (batching, the SQL predicate) is
// covered in tests/unit/onboardingSessionStore.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";

const stubs = vi.hoisted(() => ({
  deleteExpiredUnclaimedSessions: vi.fn(async () => 7),
}));

vi.mock("../../server/onboardingSession/store", () => ({
  deleteExpiredUnclaimedSessions: stubs.deleteExpiredUnclaimedSessions,
}));

const loggerStubs = vi.hoisted(() => ({
  info: vi.fn(),
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: loggerStubs.info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { runOnboardingSessionCleanupJob } = await import("../../server/onboardingSession/cleanup");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runOnboardingSessionCleanupJob", () => {
  it("deletes expired unclaimed sessions and logs the count", async () => {
    stubs.deleteExpiredUnclaimedSessions.mockResolvedValue(7);
    await runOnboardingSessionCleanupJob();
    expect(stubs.deleteExpiredUnclaimedSessions).toHaveBeenCalledTimes(1);
    expect(loggerStubs.info).toHaveBeenCalledWith(
      expect.objectContaining({ deleted: 7 }),
      expect.any(String),
    );
  });
});
