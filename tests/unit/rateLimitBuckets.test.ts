import { describe, it, expect, beforeEach, vi } from "vitest";

// Fake pg pool: supports the BEGIN/SELECT FOR UPDATE/UPDATE/COMMIT path
// the module uses, plus the simple SELECT used by secondsUntilAvailable.
// Backed by an in-memory Map so we exercise the real refill+decrement
// logic without needing a Postgres connection in unit tests.

type Row = { tokens: number; last_refill_at: Date };
const store = new Map<string, Row>();
const k = (provider: string, scopeId: string) => `${provider}::${scopeId}`;

function makeFakeClient() {
  return {
    async query(sql: string, params: unknown[] = []) {
      const text = sql.replace(/\s+/g, " ").trim();
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (text.startsWith("INSERT INTO rate_limit_buckets")) {
        const [provider, scopeId, tokens] = params as [string, string, number];
        const key = k(provider, scopeId);
        if (!store.has(key)) {
          store.set(key, { tokens: Number(tokens), last_refill_at: new Date() });
        }
        return { rows: [], rowCount: 0 };
      }
      if (text.startsWith("SELECT tokens::text, last_refill_at FROM rate_limit_buckets")) {
        const [provider, scopeId] = params as [string, string];
        const row = store.get(k(provider, scopeId));
        if (!row) return { rows: [], rowCount: 0 };
        return {
          rows: [{ tokens: String(row.tokens), last_refill_at: row.last_refill_at }],
          rowCount: 1,
        };
      }
      if (text.startsWith("UPDATE rate_limit_buckets")) {
        const [provider, scopeId, tokens, ms] = params as [string, string, number, number];
        const key = k(provider, scopeId);
        const existing = store.get(key);
        if (existing) {
          existing.tokens = Number(tokens);
          existing.last_refill_at = new Date(ms);
        }
        return { rows: [], rowCount: 1 };
      }
      if (text === "DELETE FROM rate_limit_buckets") {
        store.clear();
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unhandled SQL in fake client: ${text}`);
    },
    release() {},
  };
}

vi.mock("../../server/db", () => ({
  pool: {
    connect: async () => makeFakeClient(),
    query: async (sql: string, params: unknown[] = []) => makeFakeClient().query(sql, params),
  },
}));

const { tryAcquire, acquireOrWait, secondsUntilAvailable, _resetBuckets } =
  await import("../../server/lib/rateLimitBuckets");

describe("rateLimitBuckets", () => {
  beforeEach(async () => {
    await _resetBuckets();
  });

  it("returns true for an unknown provider (no gating)", async () => {
    expect(await tryAcquire("nonexistent", "scope")).toBe(true);
  });

  it("allows an initial burst up to capacity, then blocks", async () => {
    let acquired = 0;
    for (let i = 0; i < 10; i++) {
      if (await tryAcquire("reddit", "user-1")) acquired += 1;
    }
    expect(acquired).toBe(10);
    expect(await tryAcquire("reddit", "user-1")).toBe(false);
  });

  it("scopes per (provider, scopeId)", async () => {
    for (let i = 0; i < 10; i++) await tryAcquire("reddit", "user-A");
    expect(await tryAcquire("reddit", "user-B")).toBe(true);
  });

  it("secondsUntilAvailable returns 0 when full", async () => {
    expect(await secondsUntilAvailable("reddit", "user-x")).toBe(0);
  });

  it("secondsUntilAvailable returns ETA when drained", async () => {
    for (let i = 0; i < 10; i++) await tryAcquire("reddit", "user-y");
    const eta = await secondsUntilAvailable("reddit", "user-y");
    expect(eta).toBeGreaterThan(0);
    expect(eta).toBeLessThanOrEqual(6);
  });

  it("acquireOrWait times out and returns false", async () => {
    for (let i = 0; i < 10; i++) await tryAcquire("reddit", "user-z");
    const ok = await acquireOrWait("reddit", "user-z", 200);
    expect(ok).toBe(false);
  });

  it("acquireOrWait returns true immediately when capacity available", async () => {
    const ok = await acquireOrWait("reddit", "fresh-scope", 100);
    expect(ok).toBe(true);
  });
});
