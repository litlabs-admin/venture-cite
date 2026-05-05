// Tests for server/lib/sourceHealth.ts (Task 9 — Mentions Rebuild).
//
// Strategy: vi.mock("../../server/storage") to inject a fake storage
// implementation, then exercise shouldSkipSource / recordSourceSuccess /
// recordSourceFailure without hitting any real database.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SourceHealth } from "@shared/schema";

// ── Hoisted stubs ─────────────────────────────────────────────────────────

const stubs = vi.hoisted(() => ({
  getSourceHealth: vi.fn<() => Promise<SourceHealth | undefined>>(),
  upsertSourceHealth: vi.fn<() => Promise<void>>(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getSourceHealth: stubs.getSourceHealth,
    upsertSourceHealth: stubs.upsertSourceHealth,
  },
}));

// Import AFTER mocks are registered.
import {
  shouldSkipSource,
  recordSourceSuccess,
  recordSourceFailure,
} from "../../server/lib/sourceHealth";

// ── Helpers ───────────────────────────────────────────────────────────────

const BRAND = "brand-uuid-1";
const SOURCE = "reddit";

const NOW = new Date("2026-05-05T12:00:00Z");

function makeHealth(overrides: Partial<SourceHealth> = {}): SourceHealth {
  return {
    brandId: BRAND,
    source: SOURCE,
    consecutiveFailures: 0,
    lastFailureAt: null,
    lastFailureReason: null,
    pausedUntil: null,
    lastSuccessfulScanAt: null,
    ...overrides,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  stubs.upsertSourceHealth.mockResolvedValue(undefined);
});

// ── shouldSkipSource ──────────────────────────────────────────────────────

describe("shouldSkipSource", () => {
  it("returns { skip: false } when no health row exists", async () => {
    stubs.getSourceHealth.mockResolvedValue(undefined);
    const result = await shouldSkipSource(BRAND, SOURCE, NOW);
    expect(result).toEqual({ skip: false });
  });

  it("returns { skip: true } when paused_until is in the future", async () => {
    const futureDate = new Date("2026-05-06T12:00:00Z"); // 24h after NOW
    stubs.getSourceHealth.mockResolvedValue(
      makeHealth({ pausedUntil: futureDate, consecutiveFailures: 3 }),
    );
    const result = await shouldSkipSource(BRAND, SOURCE, NOW);
    expect(result.skip).toBe(true);
    expect(result.reason).toContain(futureDate.toISOString());
  });

  it("returns { skip: false } when paused_until is in the past", async () => {
    const pastDate = new Date("2026-05-04T12:00:00Z"); // 24h before NOW
    stubs.getSourceHealth.mockResolvedValue(
      makeHealth({ pausedUntil: pastDate, consecutiveFailures: 3 }),
    );
    const result = await shouldSkipSource(BRAND, SOURCE, NOW);
    expect(result).toEqual({ skip: false });
  });
});

// ── recordSourceSuccess ───────────────────────────────────────────────────

describe("recordSourceSuccess", () => {
  it("upserts with consecutiveFailures=0 and lastSuccessfulScanAt set", async () => {
    await recordSourceSuccess(BRAND, SOURCE);
    expect(stubs.upsertSourceHealth).toHaveBeenCalledOnce();
    const arg = stubs.upsertSourceHealth.mock.calls[0][0] as SourceHealth;
    expect(arg.brandId).toBe(BRAND);
    expect(arg.source).toBe(SOURCE);
    expect(arg.consecutiveFailures).toBe(0);
    expect(arg.lastSuccessfulScanAt).toBeInstanceOf(Date);
    expect(arg.pausedUntil).toBeNull();
    expect(arg.lastFailureAt).toBeNull();
    expect(arg.lastFailureReason).toBeNull();
  });
});

// ── recordSourceFailure ───────────────────────────────────────────────────

describe("recordSourceFailure", () => {
  it("first call sets consecutiveFailures=1 with no pause", async () => {
    stubs.getSourceHealth.mockResolvedValue(undefined); // no prior row
    await recordSourceFailure(BRAND, SOURCE, "timeout", NOW);
    expect(stubs.upsertSourceHealth).toHaveBeenCalledOnce();
    const arg = stubs.upsertSourceHealth.mock.calls[0][0] as SourceHealth;
    expect(arg.consecutiveFailures).toBe(1);
    expect(arg.pausedUntil).toBeNull();
    expect(arg.lastFailureAt).toEqual(NOW);
    expect(arg.lastFailureReason).toBe("timeout");
  });

  it("third consecutive call sets pausedUntil to now+24h", async () => {
    stubs.getSourceHealth.mockResolvedValue(makeHealth({ consecutiveFailures: 2 }));
    await recordSourceFailure(BRAND, SOURCE, "rate limited", NOW);
    expect(stubs.upsertSourceHealth).toHaveBeenCalledOnce();
    const arg = stubs.upsertSourceHealth.mock.calls[0][0] as SourceHealth;
    expect(arg.consecutiveFailures).toBe(3);
    expect(arg.pausedUntil).toBeInstanceOf(Date);
    // pausedUntil should be NOW + 24h
    const expected24h = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(arg.pausedUntil?.getTime()).toBe(expected24h.getTime());
  });

  it("does not overwrite lastSuccessfulScanAt — preserves prior value", async () => {
    const lastSuccess = new Date("2026-05-04T10:00:00Z");
    stubs.getSourceHealth.mockResolvedValue(
      makeHealth({ consecutiveFailures: 1, lastSuccessfulScanAt: lastSuccess }),
    );
    await recordSourceFailure(BRAND, SOURCE, "not found", NOW);
    const arg = stubs.upsertSourceHealth.mock.calls[0][0] as SourceHealth;
    expect(arg.lastSuccessfulScanAt).toEqual(lastSuccess);
  });
});
