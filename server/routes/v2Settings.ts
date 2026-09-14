// Endpoints read/written only by the /v2/settings and /v2/settings/integrations
// screens.
//
// Brand profile, measurement cadence, and competitor set are edited through the
// EXISTING endpoints (PUT /api/brands/:id, /api/competitors) from the client -
// this file does not duplicate them. What genuinely has no existing route:
//
//   - A read of this user's own audit_logs rows, so the Settings audit-history
//     panel shows real records instead of an invented list.
//   - Slack alert-webhook connect / disconnect / test. alert_settings has a
//     schema (shared/schema/platform.ts) but zero live routes before this -
//     verified via server/lib/opsHealthCheck.ts's own comment that the table
//     holds 0 rows in production.
//   - A "request access" action for the integrations that have no backend
//     connector at all (Google Search Console, GA4, HubSpot, Salesforce). It
//     writes a real audit_logs row rather than pretending to connect anything.
//
// Every route requires auth and scopes to a brand the caller owns.

import type { Express } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { alertSettings, auditLogs, users } from "@shared/schema";
import { requireBrand, requireUser } from "../lib/ownership";
import { logAudit } from "../lib/audit";
import { sendError, asyncHandler } from "../lib/routesShared";
import { storage } from "../storage";
import { encryptToken, decryptToken } from "../lib/tokenCipher";
import { logger } from "../lib/logger";

// The one alert_settings row per brand that this Settings/Integrations page
// owns. Distinct from the per-metric rows recordRunChangeAlerts writes
// (alertType "visibility_drop" | "prompts_lost" | "new_hallucinations") -
// this row only carries the Slack destination, not a metric threshold.
const SLACK_ALERT_TYPE = "slack_notifications";

const REQUESTABLE_PROVIDERS = ["google_search_console", "ga4", "hubspot", "salesforce"] as const;
type RequestableProvider = (typeof REQUESTABLE_PROVIDERS)[number];

function isRequestableProvider(value: unknown): value is RequestableProvider {
  return typeof value === "string" && (REQUESTABLE_PROVIDERS as readonly string[]).includes(value);
}

async function getSlackRow(brandId: string) {
  const [row] = await db
    .select()
    .from(alertSettings)
    .where(and(eq(alertSettings.brandId, brandId), eq(alertSettings.alertType, SLACK_ALERT_TYPE)))
    .limit(1);
  return row ?? null;
}

export function setupV2SettingsRoutes(app: Express): void {
  // ==========================================================================
  // GET /api/v2/settings/:brandId/audit-log
  // Real audit_logs rows for the caller, newest first. Not brand-filtered by
  // entityId - most audit actions in this app are account-level, not
  // brand-level (see server/lib/audit.ts callers) - so "for this account"
  // is the honest scope, not "for this brand". Ownership of :brandId is
  // still checked so the route can't be used to probe another user's brand.
  // ==========================================================================
  app.get(
    "/api/v2/settings/:brandId/audit-log",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const limitRaw = Number((req.query.limit as string) ?? 20);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
        const rows = await db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.userId, user.id))
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit);
        res.json({
          success: true,
          data: rows.map((row) => ({
            id: row.id,
            action: row.action,
            entityType: row.entityType,
            entityId: row.entityId,
            after: row.afterJsonb,
            createdAt: row.createdAt.toISOString(),
          })),
        });
      } catch (error) {
        sendError(res, error, "Failed to load audit history");
      }
    }),
  );

  // ==========================================================================
  // GET /api/v2/settings/:brandId/integrations
  // Real connection state for every integration this app can actually reach:
  //   - Slack: alert_settings row for this brand (webhook never returned raw).
  //   - Buffer: whether the account has a stored key (mirrors /api/buffer/status).
  //   - Recent activity: real alert_history rows for this brand.
  // Google Search Console / GA4 / HubSpot / Salesforce are not included here
  // because no connector exists - the client renders those as "Not connected"
  // from a static list, with the request-access action below.
  // ==========================================================================
  app.get(
    "/api/v2/settings/:brandId/integrations",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);

        const [slackRow, bufferRows, activity, requestRows] = await Promise.all([
          getSlackRow(req.params.brandId),
          db
            .select({ token: users.bufferAccessToken })
            .from(users)
            .where(eq(users.id, user.id))
            .limit(1),
          storage.getAlertHistory(req.params.brandId, 10),
          db
            .select()
            .from(auditLogs)
            .where(
              and(
                eq(auditLogs.userId, user.id),
                eq(auditLogs.action, "integration.request_access"),
              ),
            )
            .orderBy(desc(auditLogs.createdAt))
            .limit(10),
        ]);

        res.json({
          success: true,
          data: {
            slack: {
              connected: Boolean(slackRow?.slackEnabled),
              lastTriggered: slackRow?.lastTriggered?.toISOString() ?? null,
            },
            buffer: { connected: Boolean(bufferRows[0]?.token) },
            recentActivity: activity.map((row) => ({
              id: row.id,
              alertType: row.alertType,
              message: row.message,
              sentVia: row.sentVia,
              sentAt: row.sentAt.toISOString(),
            })),
            requests: requestRows
              .filter((row) => {
                const after = row.afterJsonb as { brandId?: string } | null;
                return after?.brandId === req.params.brandId;
              })
              .map((row) => {
                const after = row.afterJsonb as { provider?: string } | null;
                return {
                  provider: after?.provider ?? row.entityId ?? "unknown",
                  requestedAt: row.createdAt.toISOString(),
                };
              }),
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load integrations");
      }
    }),
  );

  // ==========================================================================
  // POST /api/v2/settings/:brandId/integrations/slack/connect
  // Body: { webhookUrl: string }. Rejects anything outside Slack's own
  // webhook domain (the only outbound target this route will ever call),
  // so there is no SSRF surface here despite the URL being user-supplied.
  // ==========================================================================
  app.post(
    "/api/v2/settings/:brandId/integrations/slack/connect",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);

        const raw = (req.body ?? {}).webhookUrl;
        const webhookUrl = typeof raw === "string" ? raw.trim() : "";
        if (!webhookUrl.startsWith("https://hooks.slack.com/")) {
          return res.status(400).json({
            success: false,
            error: "Enter a Slack incoming-webhook URL (starts with https://hooks.slack.com/).",
          });
        }

        const existing = await getSlackRow(req.params.brandId);
        const encrypted = encryptToken(webhookUrl);
        if (existing) {
          await db
            .update(alertSettings)
            .set({ slackEnabled: 1, slackWebhookUrl: encrypted, isEnabled: 1 })
            .where(eq(alertSettings.id, existing.id));
        } else {
          await db.insert(alertSettings).values({
            brandId: req.params.brandId,
            alertType: SLACK_ALERT_TYPE,
            isEnabled: 1,
            slackEnabled: 1,
            slackWebhookUrl: encrypted,
          });
        }

        await logAudit(req, {
          action: "integration.slack.connected",
          entityType: "integration",
          entityId: req.params.brandId,
          after: { brandId: req.params.brandId, provider: "slack" },
        });

        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to connect Slack");
      }
    }),
  );

  // ==========================================================================
  // DELETE /api/v2/settings/:brandId/integrations/slack
  // ==========================================================================
  app.delete(
    "/api/v2/settings/:brandId/integrations/slack",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);

        const existing = await getSlackRow(req.params.brandId);
        if (existing) {
          await db
            .update(alertSettings)
            .set({ slackEnabled: 0, slackWebhookUrl: null })
            .where(eq(alertSettings.id, existing.id));
        }

        await logAudit(req, {
          action: "integration.slack.disconnected",
          entityType: "integration",
          entityId: req.params.brandId,
          after: { brandId: req.params.brandId, provider: "slack" },
        });

        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to disconnect Slack");
      }
    }),
  );

  // ==========================================================================
  // POST /api/v2/settings/:brandId/integrations/slack/test
  // Sends one real message to the stored webhook and records the result to
  // alert_history (an existing, already-read table - see /api/brands/:id/alerts)
  // so "Recent activity" reflects a genuine send, not a simulated one.
  // ==========================================================================
  app.post(
    "/api/v2/settings/:brandId/integrations/slack/test",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);

        const row = await getSlackRow(req.params.brandId);
        if (!row?.slackWebhookUrl || !row.slackEnabled) {
          return res
            .status(400)
            .json({ success: false, error: "Connect a Slack webhook before sending a test." });
        }

        const webhookUrl = decryptToken(row.slackWebhookUrl);
        let slackOk = false;
        try {
          const resp = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `VentureCite test alert for ${brand.name}: your Slack integration is connected.`,
            }),
            signal: AbortSignal.timeout(8000),
          });
          slackOk = resp.ok;
        } catch (err) {
          logger.warn({ err, brandId: brand.id }, "v2-settings: slack test send failed");
        }

        if (!slackOk) {
          return res
            .status(502)
            .json({ success: false, error: "Slack rejected the test message. Check the webhook." });
        }

        await db
          .update(alertSettings)
          .set({ lastTriggered: new Date() })
          .where(eq(alertSettings.id, row.id));
        await storage.createAlertHistory({
          brandId: brand.id,
          alertType: "slack_test",
          message: "Sent a test Slack message from Settings.",
          sentVia: "slack",
        } as any);

        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to send the Slack test message");
      }
    }),
  );

  // ==========================================================================
  // POST /api/v2/settings/:brandId/integrations/:provider/request-access
  // No connector exists for these providers. Records the request as an audit
  // row rather than a fake "connected" or a "coming soon" placeholder.
  // ==========================================================================
  app.post(
    "/api/v2/settings/:brandId/integrations/:provider/request-access",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);

        const provider = req.params.provider;
        if (!isRequestableProvider(provider)) {
          return res.status(400).json({ success: false, error: "Unknown integration." });
        }

        await logAudit(req, {
          action: "integration.request_access",
          entityType: "integration_request",
          entityId: provider,
          after: { brandId: req.params.brandId, provider },
        });
        logger.info(
          { userId: user.id, brandId: req.params.brandId, provider },
          "v2-settings: integration access requested",
        );

        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to record the request");
      }
    }),
  );
}
