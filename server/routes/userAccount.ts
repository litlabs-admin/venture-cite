// User account self-service endpoints (GDPR-driven).
//
// First per-domain route file under server/routes/ — Wave 5 will split
// the 7000-line monolithic server/routes.ts the same way.
//
// Endpoints:
//   POST /api/user/delete        — schedule deletion (Art. 17, soft-first)
//   GET  /api/user/export        — export user-owned data (Art. 20)
//
// Both require authentication and re-confirmation of the user's password
// to prevent CSRF + session-hijack from causing irreversible data loss
// or full data exfil.

import type { Express, Request } from "express";
import { eq, inArray } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { supabaseAdmin } from "../supabase";
import { isAuthenticated } from "../auth";
import { db } from "../db";
import * as schema from "@shared/schema";
import { users } from "@shared/schema";
import { logger } from "../lib/logger";
import { logAudit } from "../lib/audit";
import { authRateKey } from "../lib/authRateKey";
import { asyncHandler } from "../lib/routesShared";
import {
  NOTIFICATION_TYPES,
  getPreferences,
  setPreference,
  type NotificationType,
} from "../lib/notificationPrefs";

import { captureAndFlush } from "../lib/sentryReport";
const GRACE_PERIOD_DAYS = 30;

// User-id-keyed rate limit for the export endpoint. 1 per 24h per user
// is the GDPR-friendly default — Art. 12(5) lets you refuse "manifestly
// unfounded or excessive" requests, which a daily redownload at scale
// qualifies as. Keyed by user id (not IP) so a CGNATted attacker can't
// share a bucket with the legitimate user.
const exportRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const u = (req as unknown as { user?: { id: string } }).user;
    return u?.id ?? `ip:${req.ip ?? "unknown"}`;
  },
  message: {
    success: false,
    error: "Export already requested today. Try again in 24 hours.",
  },
});

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
// Coverage is explicit per-table rather than dynamic FK introspection —
// new tables that should be exportable need to be added here. The audit
// (audit/group-7-data-handling.md) is the source of truth for what's
// considered user-owned.
async function buildUserExport(userId: string): Promise<Record<string, unknown>> {
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
    purchaseEvents,
    auditLogs,
  ] = await Promise.all([
    byBrand(schema.articles) as Promise<Array<typeof schema.articles.$inferSelect>>,
    byBrand(schema.competitors),
    byBrand(schema.citationRuns),
    byBrand(schema.brandHallucinations),
    byBrand(schema.brandMentions),
    byBrand(schema.brandPrompts),
    byBrand(schema.purchaseEvents),
    db.select().from(schema.auditLogs).where(eq(schema.auditLogs.userId, userId)),
  ]);

  // geoRankings keys off article_id (not brand_id) — second-pass query.
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
    purchaseEvents,
    auditLogs,
  };
}

// Schedule deletion. Slow rate (5 per IP per hour) so a hijacker who
// briefly has a session can't immediately destroy data; the user has
// time to receive the confirmation email and notice.
const deleteAccountRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authRateKey,
  message: {
    success: false,
    error: "Too many deletion attempts. Please wait an hour and try again.",
  },
});

export function setupUserAccountRoutes(app: Express) {
  app.post(
    "/api/user/delete",
    deleteAccountRateLimit,
    asyncHandler(async (req, res) => {
      try {
        const user = (req as unknown as { user?: { id: string; email: string | null } }).user;
        if (!user) {
          return res.status(401).json({ success: false, error: "Not authenticated" });
        }

        const { password, confirm } = (req.body ?? {}) as {
          password?: unknown;
          confirm?: unknown;
        };

        if (typeof password !== "string" || password.length === 0) {
          return res.status(400).json({
            success: false,
            error: "Password re-entry is required to delete the account.",
          });
        }
        if (confirm !== "DELETE") {
          return res.status(400).json({
            success: false,
            error: "Confirmation phrase missing. Type DELETE to confirm.",
          });
        }
        if (!user.email) {
          return res.status(400).json({
            success: false,
            error: "Account has no email on file — contact support to delete.",
          });
        }

        // Re-verify the password against Supabase to guard against session
        // theft. Don't issue a new session — we just want the credential check.
        const { error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
          email: user.email,
          password,
        });
        if (signInErr) {
          return res.status(401).json({ success: false, error: "Incorrect password." });
        }

        const now = new Date();
        const scheduledFor = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

        const [previous] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

        await db
          .update(users)
          .set({ deletedAt: now, deletionScheduledFor: scheduledFor })
          .where(eq(users.id, user.id));

        await logAudit(req, {
          action: "user.delete.scheduled",
          entityType: "user",
          entityId: user.id,
          before: previous ? { deletedAt: previous.deletedAt } : null,
          after: { deletedAt: now.toISOString(), deletionScheduledFor: scheduledFor.toISOString() },
        });

        logger.info(
          { userId: user.id, scheduledFor: scheduledFor.toISOString() },
          "user.delete: scheduled",
        );

        res.json({
          success: true,
          message: `Account deletion scheduled for ${scheduledFor.toISOString().slice(0, 10)}. Contact support before then to cancel.`,
          scheduledFor: scheduledFor.toISOString(),
        });
      } catch (err: unknown) {
        logger.error({ err }, "user.delete failed");
        captureAndFlush(err, { tags: { source: "user-delete" } });
        res.status(500).json({ success: false, error: "Failed to schedule account deletion." });
      }
    }),
  );

  app.get(
    "/api/user/export",
    exportRateLimit,
    asyncHandler(async (req, res) => {
      try {
        const user = (req as unknown as { user?: { id: string } }).user;
        if (!user) {
          return res.status(401).json({ success: false, error: "Not authenticated" });
        }

        const data = await buildUserExport(user.id);

        await logAudit(req, {
          action: "user.export",
          entityType: "user",
          entityId: user.id,
        });

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="venturecite-export-${new Date().toISOString().slice(0, 10)}.json"`,
        );
        // Pretty-print so humans can browse the file in a text editor.
        res.send(JSON.stringify(data, null, 2));
      } catch (err: unknown) {
        logger.error({ err }, "user.export failed");
        captureAndFlush(err, { tags: { source: "user-export" } });
        res.status(500).json({ success: false, error: "Failed to build export." });
      }
    }),
  );

  // Notification preferences (Wave 6.8).
  app.get(
    "/api/user/notification-preferences",
    asyncHandler(async (req, res) => {
      try {
        const user = (req as unknown as { user?: { id: string } }).user;
        if (!user) {
          return res.status(401).json({ success: false, error: "Not authenticated" });
        }
        const prefs = await getPreferences(user.id);
        res.json({
          success: true,
          data: prefs.map((p) => ({
            type: p.type,
            label: p.meta.label,
            description: p.meta.description,
            channel: p.meta.channel,
            emailEnabled: p.emailEnabled,
          })),
        });
      } catch (err: unknown) {
        logger.error({ err }, "notification-preferences.get failed");
        captureAndFlush(err, { tags: { source: "notification-prefs-get" } });
        res.status(500).json({ success: false, error: "Failed to load preferences." });
      }
    }),
  );

  // Foundations Plan 3 Task 2: profile update (firstName, lastName,
  // timezone). Partial body allowed — only sent fields are written.
  app.patch(
    "/api/user/profile",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = (req as unknown as { user?: { id: string } }).user;
        if (!user) {
          return res.status(401).json({ success: false, error: "Not authenticated" });
        }
        const { z } = await import("zod");
        const profileSchema = z.object({
          firstName: z.string().trim().max(100).optional(),
          lastName: z.string().trim().max(100).optional(),
          timezone: z.string().optional(),
        });
        const parsed = profileSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          const errorMessage =
            parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") ||
            "Invalid input";
          return res.status(400).json({ success: false, error: errorMessage });
        }
        const { firstName, lastName, timezone } = parsed.data;

        // Validate timezone against the runtime's IANA list. Older Node
        // versions without supportedValuesOf are tolerated (no-op check).
        if (timezone) {
          const valid: string[] =
            typeof (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
              .supportedValuesOf === "function"
              ? (
                  Intl as unknown as { supportedValuesOf: (k: string) => string[] }
                ).supportedValuesOf("timeZone")
              : [];
          if (valid.length > 0 && !valid.includes(timezone)) {
            return res.status(400).json({ success: false, error: "Invalid timezone" });
          }
        }

        // Empty-string firstName/lastName must NOT wipe the saved value.
        // The client always sends all three fields; if its form briefly
        // renders blank (e.g. before /auth/me hydrates), we'd overwrite
        // the user's real name with "". Treat trimmed-empty as "skip".
        const patch: Record<string, unknown> = {};
        if (firstName && firstName.trim().length > 0) patch.firstName = firstName.trim();
        if (lastName && lastName.trim().length > 0) patch.lastName = lastName.trim();
        if (timezone) patch.timezone = timezone;

        if (Object.keys(patch).length === 0) {
          return res.status(200).json({ success: true, noChange: true });
        }

        patch.updatedAt = new Date();

        await db.update(users).set(patch).where(eq(users.id, user.id));
        res.json({ success: true });
      } catch (err: unknown) {
        logger.error({ err }, "user.profile.update failed");
        captureAndFlush(err, { tags: { source: "user-profile-update" } });
        res.status(500).json({ success: false, error: "Failed to update profile." });
      }
    }),
  );

  // Foundations Plan 3 Task 2: password change. Re-auths the user by
  // signing in with the current password against a fresh user-context
  // Supabase client (the admin client can't verify passwords), then
  // updates via the admin API.
  app.post(
    "/api/user/password",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = (req as unknown as { user?: { id: string; email: string | null } }).user;
        if (!user) {
          return res.status(401).json({ success: false, error: "Not authenticated" });
        }
        const { z } = await import("zod");
        const passwordSchema = z.object({
          currentPassword: z.string().min(1, "Current password required"),
          newPassword: z.string().min(8, "Password must be at least 8 characters"),
        });
        const parsed = passwordSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          const errorMessage =
            parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") ||
            "Invalid input";
          return res.status(400).json({ success: false, error: errorMessage });
        }
        if (!user.email) {
          return res.status(400).json({
            success: false,
            error: "Account has no email on file — contact support.",
          });
        }
        const { currentPassword, newPassword } = parsed.data;

        // Re-auth using supabaseAdmin.auth.signInWithPassword — same
        // pattern as the regular login route in server/auth.ts. The
        // service-role key works here; constructing a fresh anon-key
        // client was fragile (anon key isn't reliably present in the
        // server-side env in production).
        const { data: signInData, error: signInError } =
          await supabaseAdmin.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
          });
        if (signInError || !signInData?.user) {
          return res.status(401).json({ success: false, error: "Current password incorrect" });
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
          password: newPassword,
        });
        if (updateError) {
          logger.error({ err: updateError, userId: user.id }, "user.password.update failed");
          return res.status(502).json({ success: false, error: "Password update failed" });
        }

        // Revoke all OTHER sessions (every device except the one used to
        // make this call). Without this, a stolen-then-rotated password
        // leaves attacker tokens valid on other devices. Non-fatal — the
        // password change itself succeeded; logging is enough on failure.
        try {
          const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
          if (bearer) {
            await supabaseAdmin.auth.admin.signOut(bearer, "others");
          }
        } catch (revokeErr) {
          logger.warn(
            { err: revokeErr, userId: user.id },
            "Failed to revoke other sessions after password change",
          );
        }

        await logAudit(req, {
          action: "user.password.changed",
          entityType: "user",
          entityId: user.id,
        });

        res.json({ success: true });
      } catch (err: unknown) {
        logger.error({ err }, "user.password.change failed");
        captureAndFlush(err, { tags: { source: "user-password-change" } });
        res.status(500).json({ success: false, error: "Failed to change password." });
      }
    }),
  );

  app.patch(
    "/api/user/notification-preferences",
    asyncHandler(async (req, res) => {
      try {
        const user = (req as unknown as { user?: { id: string } }).user;
        if (!user) {
          return res.status(401).json({ success: false, error: "Not authenticated" });
        }
        const { type, emailEnabled } = (req.body ?? {}) as {
          type?: unknown;
          emailEnabled?: unknown;
        };
        const validTypes = NOTIFICATION_TYPES.map((t) => t.key);
        if (typeof type !== "string" || !validTypes.includes(type as NotificationType)) {
          return res.status(400).json({ success: false, error: "Unknown notification type." });
        }
        if (typeof emailEnabled !== "boolean") {
          return res.status(400).json({ success: false, error: "emailEnabled must be a boolean." });
        }
        await setPreference(user.id, type as NotificationType, emailEnabled);
        res.json({ success: true });
      } catch (err: unknown) {
        logger.error({ err }, "notification-preferences.patch failed");
        captureAndFlush(err, { tags: { source: "notification-prefs-patch" } });
        res.status(500).json({ success: false, error: "Failed to update preferences." });
      }
    }),
  );
}
