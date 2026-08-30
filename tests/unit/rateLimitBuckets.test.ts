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

const {
  tryAcquire,
  acquireOrWait,
  secondsUntilAvailable,
  enforceFeatureCooldownOr429,
  _resetBuckets,
} = await import("../../server/lib/rateLimitBuckets");

// Minimal Express Response fake: captures the status code and JSON body
// the way res.status(n).json(body) would, without pulling in express.
function makeFakeRes() {
  const calls: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      calls.status = code;
      return res;
    },
    json(body: unknown) {
      calls.body = body;
      return res;
    },
  };
  return { res: res as unknown as import("express").Response, calls };
}

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

  it("acquireOrWait with maxWaitMs=0 still attempts an acquire (regression: was returning false unconditionally)", async () => {
    // Pre-2026-05-27 bug: `while (elapsed < 0)` never ran, so tryAcquire
    // was never called and the function returned false on the FIRST
    // click - manual-discovery handlers all pass 0 here.
    const ok = await acquireOrWait("reddit", "zero-wait-scope", 0);
    expect(ok).toBe(true);
  });

  it("acquireOrWait with maxWaitMs=0 still rejects when bucket is empty", async () => {
    for (let i = 0; i < 10; i++) await tryAcquire("reddit", "drained-scope");
    const ok = await acquireOrWait("reddit", "drained-scope", 0);
    expect(ok).toBe(false);
  });

  it("self-heals stuck-at-zero rows after enough wall time has passed", async () => {
    // Seed a row that looks "stuck": tokens=0 and last_refill_at way in the
    // past - enough time has elapsed for the bucket to be FULL but tokens
    // never recovered. Models the symptom users see after a prior
    // mid-deploy crash or a broken UPDATE that persisted bad state.
    const longAgo = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    store.set(k("reddit", "stuck-scope"), { tokens: 0, last_refill_at: longAgo });
    // The first tryAcquire after the self-heal lands should succeed
    // (treating the row as full capacity minus 1).
    expect(await tryAcquire("reddit", "stuck-scope")).toBe(true);
  });

  it("self-heals rows with future last_refill_at (clock-skew corruption)", async () => {
    // Seed a row whose last_refill_at is IN THE FUTURE - clock skew or a
    // prior bug. Old applyRefill would treat elapsedSec<0 as "no refill"
    // and the bucket stayed stuck at 0 forever. Self-heal snaps to
    // capacity.
    const future = new Date(Date.now() + 60 * 60 * 1000); // 1 hour future
    store.set(k("reddit", "future-scope"), { tokens: 0, last_refill_at: future });
    expect(await tryAcquire("reddit", "future-scope")).toBe(true);
  });

  // B7-06 consolidation: server/routes/content.ts (discover-keywords),
  // server/routes/contentTypes.ts (discover-listicles, scan-wikipedia,
  // generate-faqs) each had their own copy of "acquireOrWait, then on
  // failure secondsUntilAvailable + a 429 JSON response". These tests pin
  // the one shared response shape.
  describe("enforceFeatureCooldownOr429", () => {
    it("writes nothing and returns false when the bucket has capacity", async () => {
      const { res, calls } = makeFakeRes();
      const limited = await enforceFeatureCooldownOr429(
        res,
        "discover-keywords",
        "brand-1",
        "Keyword discovery",
      );
      expect(limited).toBe(false);
      expect(calls.status).toBeUndefined();
      expect(calls.body).toBeUndefined();
    });

    it("writes a 429 with the feature label and an ETA when the bucket is exhausted", async () => {
      for (let i = 0; i < 10; i++) await tryAcquire("discover-keywords", "brand-2");
      const { res, calls } = makeFakeRes();
      const limited = await enforceFeatureCooldownOr429(
        res,
        "discover-keywords",
        "brand-2",
        "Keyword discovery",
      );
      expect(limited).toBe(true);
      expect(calls.status).toBe(429);
      expect(calls.body).toEqual({
        success: false,
        error: "rate_limited",
        message: expect.stringMatching(
          /^Keyword discovery is on a short cooldown for this brand\. Try again in ~\d+s\.$/,
        ),
      });
    });

    it("interpolates whatever feature label and provider key the caller passes", async () => {
      for (let i = 0; i < 10; i++) await tryAcquire("scan-wikipedia", "brand-3");
      const { res, calls } = makeFakeRes();
      await enforceFeatureCooldownOr429(res, "scan-wikipedia", "brand-3", "Wikipedia scan");
      expect((calls.body as { message: string }).message).toMatch(/^Wikipedia scan is on a /);
    });
  });
});
