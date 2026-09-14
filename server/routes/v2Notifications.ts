// The /v2/notifications inbox.
//
// There is no dedicated notification-event table in this product yet
// (docs/superpowers/analysis/2026-09-14-screens/02-backend-coverage.md, row
// 43: "No notification inbox, notification item, read state, action link,
// owner, delivery attempt ... exists"). This route composes the inbox at
// read time from four sources that already record real events:
//   - alert_history: visibility_drop / prompts_lost / new_hallucinations,
//     written by server/lib/runChangeAlerts.ts at the end of every citation
//     run.
//   - citation_runs: a run's own success/failure.
//   - brand_fact_sheet conflicts (storage.getBrandFactSheetConflicts): a
//     user-entered fact and a scraped fact that disagree.
//   - work_tasks / work_award_events: a task waiting for the owner's review,
//     or one that was just verified and paid out.
//
// This product has no team, membership, or lesson-completion model (same
// backend-coverage row), so the inbox does not invent a "teammate handoff"
// or "lesson reminder" row - either would have to name a person or a lesson
// this product cannot back with a real record.
//
// Read state lives in v2_notification_reads (migration 0162), keyed by the
// stable `key` this route derives per source row below.
//
// Notification settings reuse two systems that already exist rather than a
// new one: alert_settings (brand-scoped email/Slack columns, one row per
// brand with alertType 'general') and notification_preferences (user-scoped,
// server/lib/notificationPrefs.ts, today only holds "weekly_report"). The
// approved board also shows "Critical failures" and "Quiet hours" toggles;
// neither has a backing column anywhere in the schema, so neither is
// exposed here - only controls backed by real columns are shown.

import type { Express } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { requireBrand, requireUser } from "../lib/ownership";
import { asyncHandler, sendError } from "../lib/routesShared";
import { getPreferences, setPreference } from "../lib/notificationPrefs";
import { alertSettings, workAwardEvents, workTasks } from "@shared/schema";
import type { AlertHistory, BrandFactSheet, CitationRun } from "@shared/schema";

type NotificationCategory = "needs_action" | "updates" | "completed";

type NotificationTarget =
  | { kind: "brand-facts-workspace" }
  | { kind: "visibility-evidence" }
  | { kind: "task-detail"; taskId: string };

type NotificationItem = {
  key: string;
  category: NotificationCategory;
  kind: string;
  title: string;
  description: string;
  evidenceTitle: string;
  evidenceType: string;
  occurredAt: string;
  target: NotificationTarget;
  actionLabel: string;
  read: boolean;
};

const ALERT_LABELS: Record<string, { title: string; actionLabel: string }> = {
  visibility_drop: { title: "Visibility dropped", actionLabel: "View results" },
  prompts_lost: { title: "Prompts lost citation", actionLabel: "View results" },
  new_hallucinations: { title: "New hallucinations detected", actionLabel: "View results" },
};

function asIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function alertToNotification(row: AlertHistory): NotificationItem {
  const label = ALERT_LABELS[row.alertType] ?? {
    title: row.alertType,
    actionLabel: "View results",
  };
  return {
    key: `alert:${row.id}`,
    category: "updates",
    kind: row.alertType,
    title: label.title,
    description: row.message,
    evidenceTitle: "Citation run result",
    evidenceType: "Measurement change",
    occurredAt: asIso(row.sentAt),
    target: { kind: "visibility-evidence" },
    actionLabel: label.actionLabel,
    read: false,
  };
}

function runToNotification(row: CitationRun): NotificationItem | null {
  if (row.status === "succeeded" || row.status === "partial") {
    return {
      key: `run:${row.id}`,
      category: "updates",
      kind: "results_ready",
      title: "Results ready",
      description: `New measurement results are available (${row.totalCited} of ${row.totalChecks} checks cited).`,
      evidenceTitle: "Citation run",
      evidenceType: "Measurement run",
      occurredAt: asIso(row.completedAt ?? row.startedAt),
      target: { kind: "visibility-evidence" },
      actionLabel: "View results",
      read: false,
    };
  }
  if (row.status === "failed") {
    return {
      key: `run:${row.id}`,
      category: "needs_action",
      kind: "measurement_failed",
      title: "Measurement failed",
      description: row.errorMessage ?? "Unable to complete this measurement run.",
      evidenceTitle: "Citation run",
      evidenceType: "Measurement run",
      occurredAt: asIso(row.completedAt ?? row.startedAt),
      target: { kind: "visibility-evidence" },
      actionLabel: "View results",
      read: false,
    };
  }
  return null;
}

function conflictToNotification(pair: {
  userFact: BrandFactSheet;
  scrapedFact: BrandFactSheet;
}): NotificationItem {
  const { userFact, scrapedFact } = pair;
  const candidates = [userFact.updatedAt, scrapedFact.updatedAt, userFact.lastVerified].filter(
    (value): value is Date => value instanceof Date,
  );
  const occurred =
    candidates.length > 0 ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : new Date();
  return {
    key: `fact_conflict:${userFact.id}:${scrapedFact.id}`,
    category: "needs_action",
    kind: "fact_conflict",
    title: "Fact conflict",
    description: `Conflicting values for ${userFact.factKey}: "${userFact.factValue}" vs "${scrapedFact.factValue}".`,
    evidenceTitle: `${scrapedFact.factKey}: ${scrapedFact.factValue}`.slice(0, 140),
    evidenceType: scrapedFact.sourceUrl ? "Source · External" : "Source",
    occurredAt: asIso(occurred),
    target: { kind: "brand-facts-workspace" },
    actionLabel: "Review facts",
    read: false,
  };
}

async function taskNotifications(brandId: string): Promise<NotificationItem[]> {
  const submitted = await db
    .select({ id: workTasks.id, title: workTasks.title, updatedAt: workTasks.updatedAt })
    .from(workTasks)
    .where(and(eq(workTasks.brandId, brandId), eq(workTasks.state, "submitted")))
    .orderBy(desc(workTasks.updatedAt))
    .limit(10);

  const awarded = await db
    .select({
      id: workAwardEvents.id,
      taskId: workAwardEvents.taskId,
      points: workAwardEvents.points,
      occurredAt: workAwardEvents.occurredAt,
      title: workTasks.title,
    })
    .from(workAwardEvents)
    .innerJoin(
      workTasks,
      and(
        eq(workTasks.id, workAwardEvents.taskId),
        eq(workTasks.brandId, workAwardEvents.brandId),
        eq(workTasks.userId, workAwardEvents.userId),
        eq(workTasks.taskVersion, workAwardEvents.taskVersion),
      ),
    )
    .where(and(eq(workAwardEvents.brandId, brandId), eq(workAwardEvents.awardStatus, "awarded")))
    .orderBy(desc(workAwardEvents.occurredAt))
    .limit(10);

  const items: NotificationItem[] = submitted.map((task) => ({
    key: `task_review:${task.id}`,
    category: "needs_action",
    kind: "task_needs_review",
    title: "Task ready for review",
    description: `"${task.title}" is submitted and waiting for your review.`,
    evidenceTitle: task.title,
    evidenceType: "Task · Submitted",
    occurredAt: asIso(task.updatedAt),
    target: { kind: "task-detail", taskId: task.id },
    actionLabel: "Review task",
    read: false,
  }));

  for (const award of awarded) {
    items.push({
      key: `task_award:${award.id}`,
      category: "completed",
      kind: "task_completed",
      title: "Task completed",
      description: `"${award.title}" was verified and earned ${award.points} work points.`,
      evidenceTitle: award.title,
      evidenceType: "Task · Verified",
      occurredAt: asIso(award.occurredAt),
      target: { kind: "task-detail", taskId: award.taskId },
      actionLabel: "View task",
      read: false,
    });
  }
  return items;
}

async function readKeysForUser(userId: string, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const result = await db.execute(sql`
    SELECT notification_key FROM v2_notification_reads
    WHERE user_id = ${userId} AND notification_key = ANY(${keys}::text[])
  `);
  const rows =
    (result as unknown as { rows?: Array<{ notification_key: string }> }).rows ??
    (result as unknown as Array<{ notification_key: string }>);
  return new Set((rows ?? []).map((row) => row.notification_key));
}

async function loadNotifications(brandId: string, userId: string): Promise<NotificationItem[]> {
  const [alerts, runs, conflicts, taskItems] = await Promise.all([
    storage.getAlertHistory(brandId, 15),
    storage.getCitationRunsByBrandId(brandId, 15),
    storage.getBrandFactSheetConflicts(brandId),
    taskNotifications(brandId),
  ]);

  const items: NotificationItem[] = [
    ...alerts.map(alertToNotification),
    ...runs.map(runToNotification).filter((item): item is NotificationItem => item !== null),
    ...conflicts.map(conflictToNotification),
    ...taskItems,
  ];

  if (items.length === 0) return items;

  const readSet = await readKeysForUser(
    userId,
    items.map((item) => item.key),
  );
  for (const item of items) item.read = readSet.has(item.key);

  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return items;
}

const GENERAL_ALERT_TYPE = "general";

async function loadAlertSettingsRow(brandId: string) {
  const [row] = await db
    .select()
    .from(alertSettings)
    .where(and(eq(alertSettings.brandId, brandId), eq(alertSettings.alertType, GENERAL_ALERT_TYPE)))
    .limit(1);
  return row ?? null;
}

async function loadSettingsView(brandId: string, userId: string) {
  const [row, prefs] = await Promise.all([loadAlertSettingsRow(brandId), getPreferences(userId)]);
  const weekly = prefs.find((pref) => pref.type === "weekly_report");
  return {
    emailEnabled: row ? row.emailEnabled === 1 : false,
    slackEnabled: row ? row.slackEnabled === 1 : false,
    slackConnected: Boolean(row?.slackWebhookUrl),
    weeklyReportEnabled: weekly?.emailEnabled ?? true,
  };
}

const readSchema = z.object({ key: z.string().min(1) });
const readAllSchema = z.object({ keys: z.array(z.string().min(1)).max(200) });
const settingsPatchSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    slackEnabled: z.boolean().optional(),
    weeklyReportEnabled: z.boolean().optional(),
  })
  .strict();

export function setupV2NotificationsRoutes(app: Express): void {
  // ==========================================================================
  // GET /api/v2/brands/:brandId/notifications
  // The composed inbox feed - see the file header for the four real sources.
  // ==========================================================================
  app.get(
    "/api/v2/brands/:brandId/notifications",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const notifications = await loadNotifications(brand.id, user.id);
        res.json({ success: true, data: { brandName: brand.name, notifications } });
      } catch (error) {
        sendError(res, error, "Failed to load notifications");
      }
    }),
  );

  // ==========================================================================
  // POST /api/v2/brands/:brandId/notifications/read  { key }
  // ==========================================================================
  app.post(
    "/api/v2/brands/:brandId/notifications/read",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const parsed = readSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ success: false, error: "A notification key is required" });
        }
        await db.execute(sql`
          INSERT INTO v2_notification_reads (user_id, notification_key, read_at)
          VALUES (${user.id}, ${parsed.data.key}, now())
          ON CONFLICT (user_id, notification_key) DO NOTHING
        `);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to mark the notification read");
      }
    }),
  );

  // ==========================================================================
  // POST /api/v2/brands/:brandId/notifications/read-all  { keys: string[] }
  // Marks every key the caller currently has visible-and-unread as read - the
  // client sends the keys, since which items are "currently visible" is a
  // client-side (tab + filter) concept this route does not reproduce.
  // ==========================================================================
  app.post(
    "/api/v2/brands/:brandId/notifications/read-all",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const parsed = readAllSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ success: false, error: "A list of keys is required" });
        }
        if (parsed.data.keys.length > 0) {
          await db.execute(sql`
            INSERT INTO v2_notification_reads (user_id, notification_key, read_at)
            SELECT ${user.id}, key, now() FROM unnest(${parsed.data.keys}::text[]) AS key
            ON CONFLICT (user_id, notification_key) DO NOTHING
          `);
        }
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to mark notifications read");
      }
    }),
  );

  // ==========================================================================
  // GET /api/v2/brands/:brandId/notification-settings
  // PATCH same path, body: { emailEnabled?, slackEnabled?, weeklyReportEnabled? }
  // ==========================================================================
  app.get(
    "/api/v2/brands/:brandId/notification-settings",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        res.json({ success: true, data: await loadSettingsView(brand.id, user.id) });
      } catch (error) {
        sendError(res, error, "Failed to load notification settings");
      }
    }),
  );

  app.patch(
    "/api/v2/brands/:brandId/notification-settings",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const parsed = settingsPatchSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ success: false, error: "Invalid settings payload" });
        }
        const { emailEnabled, slackEnabled, weeklyReportEnabled } = parsed.data;

        if (emailEnabled !== undefined || slackEnabled !== undefined) {
          const existing = await loadAlertSettingsRow(brand.id);
          if (existing) {
            await db
              .update(alertSettings)
              .set({
                ...(emailEnabled !== undefined ? { emailEnabled: emailEnabled ? 1 : 0 } : {}),
                ...(slackEnabled !== undefined ? { slackEnabled: slackEnabled ? 1 : 0 } : {}),
              })
              .where(eq(alertSettings.id, existing.id));
          } else {
            await db.insert(alertSettings).values({
              brandId: brand.id,
              alertType: GENERAL_ALERT_TYPE,
              emailEnabled: emailEnabled ? 1 : 0,
              slackEnabled: slackEnabled ? 1 : 0,
            });
          }
        }
        if (weeklyReportEnabled !== undefined) {
          await setPreference(user.id, "weekly_report", weeklyReportEnabled);
        }

        res.json({ success: true, data: await loadSettingsView(brand.id, user.id) });
      } catch (error) {
        sendError(res, error, "Failed to update notification settings");
      }
    }),
  );
}
