// User account GDPR self-service business logic, extracted verbatim from
// server/routes/userAccount.ts as part of the B7 service-layer split.
//
//   - buildUserExport / sanitizeUserRow back GET /api/user/export (Art. 20).
//   - scheduleAccountDeletion backs POST /api/user/delete (Art. 17,
//     soft-first). Deletion is staged: this only sets deletedAt /
//     deletionScheduledFor: a separate purge cron does the hard delete
//     after the grace window.
//
// logAudit(req, ...) calls stay in the route handlers - they need the
// Express Request for actor/IP/user-agent extraction, which this module
// must not import.

import { eq, inArray } from "drizzle-orm";
import { supabaseAdmin } from "../supabase";
import { supabaseAuth } from "../lib/supabaseAuth";
import { db } from "../db";
import * as schema from "@shared/schema";
import { users } from "@shared/schema";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";

export const GRACE_PERIOD_DAYS = 30;

// Sensitive fields stripped from the user row before export.
//   - passwordHash: never leaves the server.
//   - bufferAccessToken: encrypted blob is useless to the user and
//     hands attackers the ciphertext layer.
//   - stripeCustomerId / stripeSubscriptionId: internal billing IDs.
function sanitizeUserRow(row: typeof users.$inferSelect): Record<string, unknown> {
  const {
    passwordHash: _ph,
    bufferAccessToken: _bat,
    stripeCustomerId: _scid,
    stripeSubscriptionId: _ssid,
    ...rest
  } = row;
  void _ph;
  void _bat;
  void _scid;
  void _ssid;
  return rest;
}

// Pull every row owned (directly or via brand) by this user.
//
// Coverage is explicit per-table rather than dynamic FK introspection -
// new tables that should be exportable need to be added here. The audit
// (audit/group-7-data-handling.md) is the source of truth for what's
// considered user-owned.
export async function buildUserExport(userId: string): Promise<Record<string, unknown>> {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) {
    throw new Error("User row missing during export");
  }

  const userBrands = await db.select().from(schema.brands).where(eq(schema.brands.userId, userId));
  const brandIds = userBrands.map((b) => b.id);

  // Most child tables key by brand_id. articles also has user_id directly,
  // but using brand_id keeps the contract uniform.
  const byBrand = async <T>(table: { brandId: unknown }): Promise<T[]> => {
    if (brandIds.length === 0) return [];
    return (await db
      .select()
      .from(table as never)
      .where(inArray((table as { brandId: never }).brandId, brandIds))) as T[];
  };

  const [
    articles,
    competitors,
    citationRuns,
    brandHallucinations,
    brandMentions,
    brandPrompts,
    auditLogs,
  ] = await Promise.all([
    byBrand(schema.articles) as Promise<Array<typeof schema.articles.$inferSelect>>,
    byBrand(schema.competitors),
    byBrand(schema.citationRuns),
    byBrand(schema.brandHallucinations),
    byBrand(schema.brandMentions),
    byBrand(schema.brandPrompts),
    db.select().from(schema.auditLogs).where(eq(schema.auditLogs.userId, userId)),
  ]);

  // geoRankings keys off article_id (not brand_id) - second-pass query.
  const articleIds = articles.map((a) => a.id);
  const geoRankings =
    articleIds.length === 0
      ? []
      : await db
          .select()
          .from(schema.geoRankings)
          .where(inArray(schema.geoRankings.articleId, articleIds));

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    user: sanitizeUserRow(userRow),
    brands: userBrands,
    articles,
    competitors,
    citationRuns,
    brandHallucinations,
    brandMentions,
    brandPrompts,
    geoRankings,
    auditLogs,
  };
}

export type ScheduleAccountDeletionOutcome =
  | { kind: "invalid_password" }
  | {
      kind: "scheduled";
      deletedAt: Date;
      scheduledFor: Date;
      // Mirrors the original inline `previous ? { deletedAt: previous.deletedAt }
      // : null` shape exactly: null means no row was found (never happens in
      // practice for an authenticated user), distinct from a row that was
      // found with deletedAt already null.
      previousRow: { deletedAt: Date | null } | null;
    };

export async function scheduleAccountDeletion(params: {
  userId: string;
  email: string;
  password: string;
  bearerToken: string;
}): Promise<ScheduleAccountDeletionOutcome> {
  const { userId, email, password, bearerToken } = params;

  // Re-verify the password against Supabase to guard against session
  // theft. Don't issue a new session - we just want the credential check.
  // Use the dedicated auth client, not supabaseAdmin: signInWithPassword
  // poisons the calling client's Authorization header and would break
  // service-role Storage uploads (see server/lib/supabaseAuth.ts).
  const { error: signInErr } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (signInErr) {
    return { kind: "invalid_password" };
  }

  const now = new Date();
  const scheduledFor = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const [previous] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  await db
    .update(users)
    .set({ deletedAt: now, deletionScheduledFor: scheduledFor })
    .where(eq(users.id, userId));

  // Revoke every session after the soft delete succeeds. The application
  // gate rejects deleted users, but their refresh tokens must not remain
  // valid while the grace period is active. This must stay non-fatal: the
  // account is already deleted even when Supabase Auth is unavailable.
  try {
    if (bearerToken) {
      const { error: revokeError } = await supabaseAdmin.auth.admin.signOut(bearerToken, "global");
      if (revokeError) throw revokeError;
    }
  } catch (revokeErr) {
    logger.warn({ err: revokeErr, userId }, "Failed to revoke sessions after account deletion");
    captureAndFlush(revokeErr, { tags: { source: "user-delete-session-revocation" } });
  }

  return {
    kind: "scheduled",
    deletedAt: now,
    scheduledFor,
    previousRow: previous ? { deletedAt: previous.deletedAt } : null,
  };
}
