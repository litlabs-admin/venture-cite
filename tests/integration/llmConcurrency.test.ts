// Integration test: hits a real Postgres via the existing pool.
// Requires DATABASE_URL pointing at a dev/test DB with migration 0066 applied.
// dotenv must load BEFORE the server/db import so DATABASE_URL is set when
// the pool initializes. Global setup intentionally doesn't load dotenv -
// see tests/setup.ts.
//
// ISOLATION CONTRACT. `llm_concurrency_slots` is a globally shared token
// bucket: one row per in-flight LLM call, for every actor pointed at this
// database. That includes a dev server running locally and any other test
// file executing concurrently. So this file must
//
//   (a) never assert on a global count - it has to scope to rows it created,
//       via the run_id it passes to acquireSlot, and
//   (b) never delete rows it did not create.
//
// Both rules were previously broken. Assertions read
// `count(*) WHERE provider='openai' AND expires_at > now()` and expected 0,
// which fails the moment anything else holds an openai slot - the observed
// failure was exactly this. And cleanup deleted every row not matching
// 'lifecycle-test-%', which could free the live app's in-flight slots and
// let it exceed its own concurrency cap.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);

if (databaseTest.kind === "ready") {
  const { db } = await import("../../server/db");
  const { acquireSlot, releaseSlot, withSlot, PROVIDER_LIMITS } =
    await import("../../server/lib/llmConcurrency");

  // Every row this file creates carries a run_id starting with this prefix,
  // which is both the cleanup filter and the assertion scope.
  const RUN_PREFIX = "llmconc-test";
  const runId = (name: string) => `${RUN_PREFIX}-${name}`;
  const TEST_PROVIDER = "gemini" as const;
  // The one row inserted directly rather than through acquireSlot.
  const EXPIRED_FIXTURE = `${RUN_PREFIX}-expired`;

  async function clearSlots() {
    await db.execute(sql`
    DELETE FROM llm_concurrency_slots
    WHERE run_id LIKE ${RUN_PREFIX + "%"} OR slot_id = ${EXPIRED_FIXTURE}
  `);
  }

  /** Live (unexpired) slots for a provider across ALL actors. */
  async function liveCount(provider: string): Promise<number> {
    const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM llm_concurrency_slots
    WHERE provider = ${provider}::text AND expires_at > now()
  `);
    return (r as unknown as { rows: Array<{ n: number }> }).rows[0].n;
  }

  /** Live slots created by one of this file's runs. Immune to other actors. */
  async function ownCount(id: string): Promise<number> {
    const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM llm_concurrency_slots
    WHERE run_id = ${id}::varchar AND expires_at > now()
  `);
    return (r as unknown as { rows: Array<{ n: number }> }).rows[0].n;
  }

  /**
   * Fill the provider's bucket to its limit and return the slot ids we added.
   * Starts from the CURRENT occupancy rather than assuming an empty bucket -
   * another actor may legitimately hold slots.
   */
  async function fillBucket(provider: typeof TEST_PROVIDER, id: string): Promise<string[]> {
    const limit = PROVIDER_LIMITS[provider];
    const mine: string[] = [];
    for (let i = await liveCount(provider); i < limit; i++) {
      const s = await acquireSlot(provider, { maxRetries: 0, runId: id });
      if (!s) break; // someone else took the last slot; bucket is full either way
      mine.push(s.slotId);
    }
    return mine;
  }

  describe("llmConcurrency token bucket", () => {
    beforeEach(clearSlots);
    afterEach(clearSlots);

    it("acquires a slot when bucket is empty", async () => {
      const id = runId("acquire");
      const slot = await acquireSlot(TEST_PROVIDER, { runId: id });
      expect(slot).not.toBeNull();
      expect(typeof slot?.slotId).toBe("string");
      expect(await ownCount(id)).toBe(1);
    });

    it("returns null when bucket is full", async () => {
      const id = runId("full");
      await fillBucket(TEST_PROVIDER, id);
      expect(await liveCount(TEST_PROVIDER)).toBeGreaterThanOrEqual(PROVIDER_LIMITS[TEST_PROVIDER]);
      const slot = await acquireSlot(TEST_PROVIDER, { maxRetries: 0, runId: id });
      expect(slot).toBeNull();
    });

    it("releaseSlot frees the bucket", async () => {
      const id = runId("release");
      const mine = await fillBucket(TEST_PROVIDER, id);
      expect(mine.length).toBeGreaterThan(0);
      expect(await acquireSlot(TEST_PROVIDER, { maxRetries: 0, runId: id })).toBeNull();

      await releaseSlot(mine[0]);
      const reacquired = await acquireSlot(TEST_PROVIDER, { maxRetries: 0, runId: id });
      expect(reacquired).not.toBeNull();
    });

    it("expired slots don't block new acquisitions", async () => {
      const id = runId("expired");
      await db.execute(sql`
      INSERT INTO llm_concurrency_slots (slot_id, provider, acquired_at, expires_at, run_id)
      VALUES (${EXPIRED_FIXTURE}, ${TEST_PROVIDER}::text, now() - interval '5 minutes', now() - interval '1 minute', ${id}::varchar)
    `);
      // The expired row exists but must not count toward the limit.
      expect(await ownCount(id)).toBe(0);
      const slot = await acquireSlot(TEST_PROVIDER, { maxRetries: 0, runId: id });
      expect(slot).not.toBeNull();
    });

    it("withSlot acquires, runs, and releases", async () => {
      const id = runId("ok");
      let ran = false;
      const result = await withSlot(TEST_PROVIDER, id, async () => {
        ran = true;
        // Exactly one slot for THIS run while the callback is in flight.
        expect(await ownCount(id)).toBe(1);
        return "ok";
      });
      expect(ran).toBe(true);
      expect(result).toBe("ok");
      expect(await ownCount(id)).toBe(0);
    });

    it("withSlot releases even if the callback throws", async () => {
      const id = runId("err");
      await expect(
        withSlot(TEST_PROVIDER, id, async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      // The `finally` in withSlot must have released it.
      expect(await ownCount(id)).toBe(0);
    });
  });
} else {
  describe.skip("llmConcurrency token bucket", () => {
    it("requires TEST_DATABASE_URL", () => {});
  });
}
