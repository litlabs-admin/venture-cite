// Direct, no-HTTP tests for server/services/onboardingState.ts (B7 service
// extraction). Proves the allowlist filter and jsonb-merge update work when
// called directly.

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  updateQueue: [] as unknown[],
  updateMock: vi.fn(),
}));

function makeUpdateChain(result: unknown) {
  const chain: any = {
    set: () => chain,
    where: () => chain,
    returning: () => Promise.resolve(result),
  };
  return chain;
}
dbState.updateMock.mockImplementation(() => makeUpdateChain(dbState.updateQueue.shift() ?? []));

vi.mock("../../server/db", () => ({
  db: { update: dbState.updateMock },
  pool: {},
}));

const { applyOnboardingStatePatch, ONBOARDING_FIELDS } =
  await import("../../server/services/onboardingState");

beforeEach(() => {
  dbState.updateQueue.length = 0;
  dbState.updateMock.mockClear();
});

describe("applyOnboardingStatePatch", () => {
  it("returns no_fields and skips the write when nothing in the body is allowlisted", async () => {
    const result = await applyOnboardingStatePatch("user-1", { bogusKey: "nope" });

    expect(result).toEqual({ kind: "no_fields", allowedFields: Array.from(ONBOARDING_FIELDS) });
    expect(dbState.updateMock).not.toHaveBeenCalled();
  });

  it("drops non-allowlisted keys and writes only the allowlisted ones", async () => {
    dbState.updateQueue.push([{ onboardingState: { guidedSeen: true } }]);

    const result = await applyOnboardingStatePatch("user-1", {
      guidedSeen: true,
      bogusKey: "nope",
    });

    expect(result).toEqual({ kind: "updated", onboardingState: { guidedSeen: true } });
    expect(dbState.updateMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty object when the update affects no row", async () => {
    dbState.updateQueue.push([]);

    const result = await applyOnboardingStatePatch("user-1", { guidedSeen: true });

    expect(result).toEqual({ kind: "updated", onboardingState: {} });
  });
});
