// Notification preferences helper (Wave 6.8).
//
// Exposes the user-facing types registry + read/write helpers backed
// by the notification_preferences table. The weekly_report type also
// dual-writes users.weekly_report_enabled so the existing scheduler
// and unsubscribe route don't need to change — they stay in sync as
// long as every write goes through setPreference().
//
// Add a new user-facing notification by appending to NOTIFICATION_TYPES.
// Non-dismissable categories (billing, security) live at the send site
// and are intentionally absent here.

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { notificationPreferences, users } from "@shared/schema";

export type NotificationType = "weekly_report";

export type NotificationTypeMeta = {
  key: NotificationType;
  label: string;
  description: string;
  channel: "email";
};

export const NOTIFICATION_TYPES: NotificationTypeMeta[] = [
  {
    key: "weekly_report",
    label: "Weekly visibility report",
    description:
      "Every Sunday, a summary of citation results across your brands and top platforms.",
    channel: "email",
  },
];

export async function getPreferences(
  userId: string,
): Promise<Array<{ type: NotificationType; emailEnabled: boolean; meta: NotificationTypeMeta }>> {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  const byType = new Map(rows.map((r) => [r.type, r.emailEnabled]));

  return NOTIFICATION_TYPES.map((meta) => ({
    type: meta.key,
    // Default to enabled when no row exists — matches the table default.
    emailEnabled: byType.get(meta.key) ?? true,
    meta,
  }));
}

export async function setPreference(
  userId: string,
  type: NotificationType,
  emailEnabled: boolean,
): Promise<void> {
  await db
    .insert(notificationPreferences)
    .values({ userId, type, emailEnabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.type],
      set: { emailEnabled, updatedAt: new Date() },
    });

  // Dual-write for back-compat: the scheduler + unsubscribe route
  // still read/write users.weekly_report_enabled.
  if (type === "weekly_report") {
    await db
      .update(users)
      .set({ weeklyReportEnabled: emailEnabled ? 1 : 0 })
      .where(eq(users.id, userId));
  }
}

export async function isEnabled(userId: string, type: NotificationType): Promise<boolean> {
  const [row] = await db
    .select({ enabled: notificationPreferences.emailEnabled })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.type, type)))
    .limit(1);
  if (!row) return true;
  return row.enabled;
}
