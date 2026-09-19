// Drizzle access to onboarding_sessions. This is the only module that reads
// or writes the table - producers (site.ts, analyze.ts, ...) never touch the
// database. Spec: docs/superpowers/specs/2026-09-18-onboarding-data-contract.md.
//
// events is append-only. appendEvent runs an atomic
// `events = events || $1::jsonb` UPDATE rather than read-modify-write, so two
// producers finishing at the same moment (pipeline.ts fans several out in
// parallel) can never clobber each other's event.
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { onboardingSessions } from "@shared/schema/onboarding";
import {
  ONBOARDING_SESSIONS_PER_IP_PER_HOUR,
  sessionEventSchema,
  type SessionAnswers,
  type SessionEvent,
} from "@shared/onboarding/session";
import type { OnboardingSession } from "@shared/schema/onboarding";

/** Batch size for the expired-session sweep. See deleteExpiredUnclaimedSessions. */
const EXPIRY_CLEANUP_BATCH_SIZE = 500;

export type AdmitResult =
  | { kind: "created"; session: OnboardingSession }
  | { kind: "rate_limited" }
  | { kind: "live_session_exists"; sessionId: string; domain: string };

function mapRow(row: Record<string, unknown>): OnboardingSession {
  return {
    id: row.id as string,
    domain: row.domain as string,
    ipHash: row.ip_hash as string,
    status: row.status as OnboardingSession["status"],
    events: row.events as SessionEvent[],
    answers: row.answers as SessionAnswers | null,
    claimedBy: (row.claimed_by as string | null) ?? null,
    claimedBrandId: (row.claimed_brand_id as string | null) ?? null,
    claimedAt: (row.claimed_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
    expiresAt: row.expires_at as Date,
  };
}

/**
 * Admits a new onboarding session for one IP, or explains why it can't.
 *
 * Everything below runs inside one transaction holding
 * pg_advisory_xact_lock keyed on the ip hash, so concurrent requests from the
 * same IP are serialized rather than all reading the same "count so far" and
 * all passing. The lock is transaction-scoped: it releases automatically on
 * COMMIT/ROLLBACK, even if the process crashes mid-transaction.
 *
 * Order of checks: an existing live session for this IP wins over the
 * hourly-count check, because a session that already exists shouldn't be
 * blocked by its own past creation count.
 */
export async function admitSession(input: {
  domain: string;
  ipHash: string;
}): Promise<AdmitResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
      `onboarding_admit:${input.ipHash}`,
    ]);

    const { rows: liveRows } = await client.query<{ id: string; domain: string }>(
      `SELECT id, domain FROM onboarding_sessions
       WHERE ip_hash = $1 AND status = 'running' AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.ipHash],
    );
    if (liveRows[0]) {
      await client.query("COMMIT");
      return {
        kind: "live_session_exists",
        sessionId: liveRows[0].id,
        domain: liveRows[0].domain,
      };
    }

    const { rows: countRows } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM onboarding_sessions
       WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`,
      [input.ipHash],
    );
    const recentCount = countRows[0]?.count ?? 0;
    if (recentCount >= ONBOARDING_SESSIONS_PER_IP_PER_HOUR) {
      await client.query("COMMIT");
      return { kind: "rate_limited" };
    }

    const { rows } = await client.query(
      `INSERT INTO onboarding_sessions (domain, ip_hash) VALUES ($1, $2) RETURNING *`,
      [input.domain, input.ipHash],
    );
    await client.query("COMMIT");
    return { kind: "created", session: mapRow(rows[0]) };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Deletes expired, unclaimed sessions in bounded batches, using
 * onboarding_sessions_unclaimed_expiry_idx. Claimed sessions are kept even
 * past expiry: the brand they produced points back at them. Returns the
 * total number of rows deleted.
 */
export async function deleteExpiredUnclaimedSessions(
  batchSize: number = EXPIRY_CLEANUP_BATCH_SIZE,
): Promise<number> {
  let totalDeleted = 0;
  for (;;) {
    const result = await pool.query(
      `DELETE FROM onboarding_sessions
       WHERE id IN (
         SELECT id FROM onboarding_sessions
         WHERE claimed_by IS NULL AND expires_at < now()
         LIMIT $1
       )`,
      [batchSize],
    );
    const deleted = result.rowCount ?? 0;
    totalDeleted += deleted;
    if (deleted < batchSize) break;
  }
  return totalDeleted;
}

/**
 * Append one event to the session's event list. Validates against
 * sessionEventSchema before writing, then updates atomically - never a
 * read-modify-write - so concurrent appends from parallel producers cannot
 * drop each other's event.
 */
export async function appendEvent(id: string, event: SessionEvent): Promise<void> {
  const parsed = sessionEventSchema.parse(event);
  await db
    .update(onboardingSessions)
    .set({ events: sql`${onboardingSessions.events} || ${JSON.stringify([parsed])}::jsonb` })
    .where(eq(onboardingSessions.id, id));
}

/** Returns null when the session does not exist or has expired. */
export async function getSession(id: string): Promise<OnboardingSession | null> {
  const [row] = await db
    .select()
    .from(onboardingSessions)
    .where(eq(onboardingSessions.id, id))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export async function setAnswers(id: string, answers: SessionAnswers): Promise<void> {
  await db.update(onboardingSessions).set({ answers }).where(eq(onboardingSessions.id, id));
}

export async function setStatus(id: string, status: OnboardingSession["status"]): Promise<void> {
  await db.update(onboardingSessions).set({ status }).where(eq(onboardingSessions.id, id));
}
