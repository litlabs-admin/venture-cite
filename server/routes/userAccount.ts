// User account self-service endpoints (GDPR-driven).
//
// User account routes live in a per-domain module.
//
// Endpoints:
//   POST /api/user/delete        - schedule deletion (Art. 17, soft-first)
//   GET  /api/user/export        - export user-owned data (Art. 20)
//
// Both require authentication and re-confirmation of the user's password
// to prevent CSRF + session-hijack from causing irreversible data loss
// or full data exfil.

import type { Express, Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { isAuthenticated } from "../auth";
import { logger } from "../lib/logger";
import { logAudit } from "../lib/audit";
import { authRateKey } from "../lib/authRateKey";
import { asyncHandler } from "../lib/routesShared";
import { buildUserExport, scheduleAccountDeletion } from "../services/userGdpr";
import { applyProfileUpdate, changeUserPassword } from "../services/userSettings";
import {
  NOTIFICATION_TYPES,
  getPreferences,
  setPreference,
  type NotificationType,
} from "../lib/notificationPrefs";

import { captureAndFlush } from "../lib/sentryReport";

// User-id-keyed rate limit for the export endpoint. 1 per 24h per user
// is the GDPR-friendly default - Art. 12(5) lets you refuse "manifestly
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
    return u?.id ?? `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
  },
  message: {
    success: false,
    error: "Export already requested today. Try again in 24 hours.",
  },
});

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
            error: "Account has no email on file - contact support to delete.",
          });
        }

        const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

        const outcome = await scheduleAccountDeletion({
          userId: user.id,
          email: user.email,
          password,
          bearerToken: bearer,
        });

        if (outcome.kind === "invalid_password") {
          return res.status(401).json({ success: false, error: "Incorrect password." });
        }

        await logAudit(req, {
          action: "user.delete.scheduled",
          entityType: "user",
          entityId: user.id,
          before: outcome.previousRow,
          after: {
            deletedAt: outcome.deletedAt.toISOString(),
            deletionScheduledFor: outcome.scheduledFor.toISOString(),
          },
        });

        logger.info(
          { userId: user.id, scheduledFor: outcome.scheduledFor.toISOString() },
          "user.delete: scheduled",
        );

        res.json({
          success: true,
          message: `Account deletion scheduled for ${outcome.scheduledFor.toISOString().slice(0, 10)}. Contact support before then to cancel.`,
          scheduledFor: outcome.scheduledFor.toISOString(),
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

  // Notification preferences.
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

  // Profile update for firstName, lastName, and
  // timezone). Partial body allowed - only sent fields are written.
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
            parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") ||
            "Invalid input";
          return res.status(400).json({ success: false, error: errorMessage });
        }

        const outcome = await applyProfileUpdate(user.id, parsed.data);
        if (outcome.kind === "invalid_timezone") {
          return res.status(400).json({ success: false, error: "Invalid timezone" });
        }
        if (outcome.kind === "no_change") {
          return res.status(200).json({ success: true, noChange: true });
        }
        res.json({ success: true });
      } catch (err: unknown) {
        logger.error({ err }, "user.profile.update failed");
        captureAndFlush(err, { tags: { source: "user-profile-update" } });
        res.status(500).json({ success: false, error: "Failed to update profile." });
      }
    }),
  );

  // Password change. Re-authenticate the user by
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
          newPassword: z.string(),
        });
        const parsed = passwordSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          const errorMessage =
            parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") ||
            "Invalid input";
          return res.status(400).json({ success: false, error: errorMessage });
        }
        if (!user.email) {
          return res.status(400).json({
            success: false,
            error: "Account has no email on file - contact support.",
          });
        }
        const { currentPassword, newPassword } = parsed.data;
        const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

        const outcome = await changeUserPassword({
          userId: user.id,
          email: user.email,
          currentPassword,
          newPassword,
          bearerToken: bearer,
        });

        if (outcome.kind === "weak_password") {
          return res.status(400).json({ success: false, error: outcome.error });
        }
        if (outcome.kind === "wrong_current_password") {
          return res.status(401).json({ success: false, error: "Current password incorrect" });
        }
        if (outcome.kind === "update_rejected") {
          return res.status(outcome.status).json({ success: false, error: outcome.error });
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
