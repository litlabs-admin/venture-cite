// Postgres-backed token bucket for capping concurrent LLM calls per provider.
//
// Why Postgres and not Redis? We already have Supabase. Adding Redis would
// mean another service, another env var, another runtime failure mode. The
// throughput cost (~10ms per acquire vs <1ms for Redis) is acceptable for
// LLM calls that take seconds anyway.
//
// Crash safety: every slot row has `expires_at = now() + 60s` set at insert
// time. A function that dies mid-call doesn't leak its slot — the next
// acquire sees the row as expired and won't count it. Daily-orchestrator
// also sweeps expired rows for housekeeping.
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "./logger";

export type LlmProvider = "openai" | "anthropic" | "perplexity" | "gemini";

export const PROVIDER_LIMITS: Record<LlmProvider, number> = {
  openai: 20,
  anthropic: 20,
  perplexity: 10,
  gemini: 30,
};

const SLOT_TTL_MS = 60_000;
const RETRY_SLEEP_MS = 2_000;
const DEFAULT_MAX_RETRIES = 5;

export interface AcquireOptions {
  maxRetries?: number;
  runId?: string;
}

interface PgQueryResult<T> {
  rows: T[];
}

export interface AcquiredSlot {
  slotId: string;
  provider: LlmProvider;
}

/**
 * Atomically try to acquire a slot. Returns null if the bucket is full
 * after retries exhaust. Caller MUST call releaseSlot when done.
 */
export async function acquireSlot(
  provider: LlmProvider,
  opts: AcquireOptions = {},
): Promise<AcquiredSlot | null> {
  const limit = PROVIDER_LIMITS[provider];
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const runId = opts.runId ?? null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await db.execute(sql`
      WITH inserted AS (
        INSERT INTO llm_concurrency_slots (slot_id, provider, expires_at, run_id)
        SELECT
          gen_random_uuid()::text,
          ${provider}::text,
          now() + (${SLOT_TTL_MS} || ' milliseconds')::interval,
          ${runId}::varchar
        WHERE (
          SELECT count(*) FROM llm_concurrency_slots
          WHERE provider = ${provider}::text AND expires_at > now()
        ) < ${limit}
        RETURNING slot_id
      )
      SELECT slot_id FROM inserted;
    `);

    const rows = (result as unknown as PgQueryResult<{ slot_id: string }>).rows;
    if (rows[0]?.slot_id) {
      return { slotId: rows[0].slot_id, provider };
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, RETRY_SLEEP_MS));
    }
  }

  logger.warn({ provider, limit, maxRetries }, "llmConcurrency: bucket full");
  return null;
}

export async function releaseSlot(slotId: string): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM llm_concurrency_slots WHERE slot_id = ${slotId}
    `);
  } catch (err) {
    logger.warn({ err, slotId }, "llmConcurrency: release failed");
  }
}

/**
 * Convenience wrapper: acquire → run → release (in finally so a throwing
 * callback still frees its slot). Throws if the bucket is full after retries.
 */
export async function withSlot<T>(
  provider: LlmProvider,
  runId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const slot = await acquireSlot(provider, { runId });
  if (!slot) {
    const err = new Error(`llmConcurrency: bucket full for ${provider}`);
    (err as Error & { code?: string }).code = "LLM_CONCURRENCY_FULL";
    throw err;
  }
  try {
    return await fn();
  } finally {
    await releaseSlot(slot.slotId);
  }
}
