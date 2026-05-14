// Integration test: hits a real Postgres via the existing pool.
// Requires DATABASE_URL pointing at a dev/test DB with migration 0066 applied.
// dotenv must load BEFORE the server/db import so DATABASE_URL is set when
// the pool initializes. Global setup intentionally doesn't load dotenv —
// see tests/setup.ts.
import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import {
  acquireSlot,
  releaseSlot,
  withSlot,
  PROVIDER_LIMITS,
} from "../../server/lib/llmConcurrency";

async function clearSlots() {
  await db.execute(sql`DELETE FROM llm_concurrency_slots`);
}

describe("llmConcurrency token bucket", () => {
  beforeEach(clearSlots);
  afterEach(clearSlots);

  it("acquires a slot when bucket is empty", async () => {
    const slot = await acquireSlot("openai");
    expect(slot).not.toBeNull();
    expect(typeof slot?.slotId).toBe("string");
  });

  it("returns null when bucket is full", async () => {
    const limit = PROVIDER_LIMITS.openai;
    for (let i = 0; i < limit; i++) {
      await acquireSlot("openai");
    }
    const slot = await acquireSlot("openai", { maxRetries: 0 });
    expect(slot).toBeNull();
  });

  it("releaseSlot frees the bucket", async () => {
    const limit = PROVIDER_LIMITS.openai;
    const slots: string[] = [];
    for (let i = 0; i < limit; i++) {
      const s = await acquireSlot("openai");
      if (s) slots.push(s.slotId);
    }
    expect(await acquireSlot("openai", { maxRetries: 0 })).toBeNull();
    await releaseSlot(slots[0]);
    const reacquired = await acquireSlot("openai", { maxRetries: 0 });
    expect(reacquired).not.toBeNull();
  });

  it("expired slots don't block new acquisitions", async () => {
    await db.execute(sql`
      INSERT INTO llm_concurrency_slots (slot_id, provider, acquired_at, expires_at)
      VALUES ('expired-1', 'openai', now() - interval '5 minutes', now() - interval '1 minute')
    `);
    const slot = await acquireSlot("openai", { maxRetries: 0 });
    expect(slot).not.toBeNull();
  });

  it("withSlot acquires, runs, and releases", async () => {
    let ran = false;
    const result = await withSlot("openai", "run-abc", async () => {
      ran = true;
      const used = await db.execute(
        sql`SELECT count(*)::int AS n FROM llm_concurrency_slots WHERE provider='openai' AND expires_at > now()`,
      );
      const row = (used as unknown as { rows: Array<{ n: number }> }).rows[0];
      expect(row.n).toBe(1);
      return "ok";
    });
    expect(ran).toBe(true);
    expect(result).toBe("ok");
    const after = await db.execute(
      sql`SELECT count(*)::int AS n FROM llm_concurrency_slots WHERE provider='openai' AND expires_at > now()`,
    );
    const row = (after as unknown as { rows: Array<{ n: number }> }).rows[0];
    expect(row.n).toBe(0);
  });

  it("withSlot releases even if the callback throws", async () => {
    await expect(
      withSlot("openai", "run-err", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const after = await db.execute(
      sql`SELECT count(*)::int AS n FROM llm_concurrency_slots WHERE provider='openai' AND expires_at > now()`,
    );
    const row = (after as unknown as { rows: Array<{ n: number }> }).rows[0];
    expect(row.n).toBe(0);
  });
});
