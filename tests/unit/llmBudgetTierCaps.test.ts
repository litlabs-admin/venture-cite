// Coverage for the per-tier daily token caps in server/lib/llmPricing.ts
// and their enforcement in server/lib/llmBudget.ts.
//
// 2026-08-31: DAILY_TOKEN_CAP was `-1` (unlimited) for every tier for
// months. A runaway onboarding loop ran 114 full citation sweeps in 34
// hours and burned roughly $65 of provider spend before anyone noticed,
// because nothing capped it. These tests pin the restored caps and the
// assertWithinBudget enforcement around them: under cap passes, at cap
// is rejected, over cap is rejected, and `-1` is still honored as an
// explicit "unlimited" escape hatch.

import { describe, it, expect, beforeEach, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  dbExecute: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: { execute: stubs.dbExecute },
  pool: {},
}));

const warnSpy = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/logger", () => ({
  logger: { warn: warnSpy, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { assertWithinBudget } = await import("../../server/lib/llmBudget");
const { DAILY_TOKEN_CAP, CHATBOT_DAILY_TOKEN_CAP, CHATBOT_MESSAGES_PER_HOUR, BudgetExceededError } =
  await import("../../server/lib/llmPricing");
const { usageLimits } = await import("@shared/schema");

function mockUsed(total: number) {
  stubs.dbExecute.mockResolvedValueOnce({ rows: [{ total }] });
}

beforeEach(() => {
  stubs.dbExecute.mockReset();
  warnSpy.mockReset();
});

describe("DAILY_TOKEN_CAP values", () => {
  it("bounds free and beta tiers", () => {
    expect(DAILY_TOKEN_CAP.free).toBeGreaterThan(0);
    expect(DAILY_TOKEN_CAP.beta).toBeGreaterThan(0);
    expect(DAILY_TOKEN_CAP.free).toBe(200_000);
    expect(DAILY_TOKEN_CAP.beta).toBe(800_000);
  });

  it("bounds paid tiers generously but finitely", () => {
    expect(DAILY_TOKEN_CAP.pro).toBe(4_000_000);
    expect(DAILY_TOKEN_CAP.enterprise).toBe(20_000_000);
    expect(DAILY_TOKEN_CAP.pro).toBeGreaterThan(DAILY_TOKEN_CAP.beta);
    expect(DAILY_TOKEN_CAP.enterprise).toBeGreaterThan(DAILY_TOKEN_CAP.pro);
  });

  it("bounds the admin tier instead of leaving it at -1", () => {
    // Admin used to be the exact escape hatch that let the runaway loop
    // spend unbounded - it must be finite even if generous.
    expect(DAILY_TOKEN_CAP.admin).toBeGreaterThan(0);
    expect(DAILY_TOKEN_CAP.admin).toBe(50_000_000);
  });
});

describe("assertWithinBudget enforcement", () => {
  it("passes when usage is under the cap", async () => {
    mockUsed(DAILY_TOKEN_CAP.free - 1);
    await expect(assertWithinBudget("user-1", "free")).resolves.toBeUndefined();
  });

  it("rejects when usage is exactly at the cap", async () => {
    mockUsed(DAILY_TOKEN_CAP.free);
    await expect(assertWithinBudget("user-1", "free")).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("rejects when usage is over the cap", async () => {
    mockUsed(DAILY_TOKEN_CAP.free + 50_000);
    await expect(assertWithinBudget("user-1", "free")).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("logs a warn on exceed so the block is observable", async () => {
    mockUsed(DAILY_TOKEN_CAP.free);
    await expect(assertWithinBudget("user-1", "free")).rejects.toBeInstanceOf(BudgetExceededError);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", tier: "free" }),
      expect.stringContaining("exceeded"),
    );
  });

  it("fails closed: the error carries the tier, cap, and used tokens", async () => {
    mockUsed(DAILY_TOKEN_CAP.beta + 1);
    try {
      await assertWithinBudget("user-2", "beta");
      throw new Error("expected assertWithinBudget to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BudgetExceededError);
      const budgetErr = err as InstanceType<typeof BudgetExceededError>;
      expect(budgetErr.tier).toBe("beta");
      expect(budgetErr.capTokens).toBe(DAILY_TOKEN_CAP.beta);
      expect(budgetErr.usedTokens).toBe(DAILY_TOKEN_CAP.beta + 1);
    }
  });

  it("still honors -1 as an explicit unlimited override", async () => {
    const original = DAILY_TOKEN_CAP.free;
    (DAILY_TOKEN_CAP as Record<string, number>).free = -1;
    try {
      await expect(assertWithinBudget("user-3", "free")).resolves.toBeUndefined();
      // Unlimited short-circuits before touching the DB at all.
      expect(stubs.dbExecute).not.toHaveBeenCalled();
    } finally {
      (DAILY_TOKEN_CAP as Record<string, number>).free = original;
    }
  });

  it("logs a warn (not error) when usage crosses 80% of the cap without exceeding it", async () => {
    mockUsed(Math.ceil(DAILY_TOKEN_CAP.free * 0.85));
    await expect(assertWithinBudget("user-4", "free")).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-4", tier: "free" }),
      expect.stringContaining("80%"),
    );
  });
});

// Every tier the application can issue must have its own cap.
//
// The cap maps were hand-written beside usageLimits and drifted from it: they
// named enterprise and admin, which no production user holds, and omitted
// pending, readonly and agency, which 6, some and 6 accounts respectively do.
// llmBudget.ts resolves a missing key with `?? DAILY_TOKEN_CAP.free`, so every
// agency account - a SELLABLE tier, ranked above pro - would have silently
// inherited the free-tier allowance the moment enforcement was switched on.
//
// Deriving Tier from usageLimits makes tsc reject an incomplete map, so this
// suite documents the invariant and pins the ordering tsc cannot check.
describe("tier cap coverage", () => {
  const tiers = Object.keys(usageLimits) as Array<keyof typeof usageLimits>;

  it("gives every usageLimits tier a token cap, with none falling through to free", () => {
    for (const tier of tiers) {
      expect(DAILY_TOKEN_CAP[tier], `DAILY_TOKEN_CAP.${tier}`).toBeTypeOf("number");
      expect(CHATBOT_DAILY_TOKEN_CAP[tier], `CHATBOT_DAILY_TOKEN_CAP.${tier}`).toBeTypeOf("number");
      expect(CHATBOT_MESSAGES_PER_HOUR[tier], `CHATBOT_MESSAGES_PER_HOUR.${tier}`).toBeTypeOf(
        "number",
      );
    }
  });

  it("covers every tier held in production", () => {
    // Measured against the live database on 2026-08-31.
    for (const tier of ["free", "agency", "pending", "pro", "beta"] as const) {
      expect(tiers).toContain(tier);
    }
  });

  it("does not rank a paying tier below a cheaper one", () => {
    expect(DAILY_TOKEN_CAP.agency).toBeGreaterThan(DAILY_TOKEN_CAP.pro);
    expect(DAILY_TOKEN_CAP.pro).toBeGreaterThan(DAILY_TOKEN_CAP.beta);
    expect(DAILY_TOKEN_CAP.beta).toBeGreaterThan(DAILY_TOKEN_CAP.free);
    expect(DAILY_TOKEN_CAP.free).toBeGreaterThan(DAILY_TOKEN_CAP.pending);
    expect(DAILY_TOKEN_CAP.pending).toBeGreaterThan(DAILY_TOKEN_CAP.readonly);
  });

  it("bounds every tier, so no tier is unlimited by default", () => {
    for (const tier of tiers) {
      expect(DAILY_TOKEN_CAP[tier], `DAILY_TOKEN_CAP.${tier}`).toBeGreaterThan(0);
    }
  });
});
