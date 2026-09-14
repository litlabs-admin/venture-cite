import type { Board43Data } from "./Screen";

// The approved render (18-notifications-and-inbox.png) also shows a
// "Teammate handoff" row, a "Lesson reminder" row, and "Critical failures" /
// "Quiet hours" settings toggles. This product has no team, membership, or
// lesson-completion model, and no quiet-hours or per-category "critical"
// column anywhere in the schema (docs/superpowers/analysis/2026-09-14-screens
// /02-backend-coverage.md, row 43) - server/routes/v2Notifications.ts cannot
// produce any of those honestly, so this fixture omits them too, to stay a
// true preview of what the live adapter can actually return.

export const board43Fixture: Board43Data = {
  brandId: "470b15fe-606b-4d96-ab62-69a01e08b237",
  mode: "guided",
  brandName: "VenturePR",
  notifications: [
    {
      key: "fact_conflict:fact-user-1:fact-scraped-1",
      category: "needs_action",
      kind: "fact_conflict",
      title: "Fact conflict",
      description: 'Conflicting values for founded: "2020" vs "2019".',
      evidenceTitle: "founded: 2019",
      evidenceType: "Source · External",
      occurredAt: "2026-09-12T10:18:00.000Z",
      target: { kind: "brand-facts-workspace" },
      actionLabel: "Review facts",
      read: false,
    },
    {
      key: "task_review:task-9",
      category: "needs_action",
      kind: "task_needs_review",
      title: "Task ready for review",
      description: '"Update the service region" is submitted and waiting for your review.',
      evidenceTitle: "Update the service region",
      evidenceType: "Task · Submitted",
      occurredAt: "2026-09-11T15:27:00.000Z",
      target: { kind: "task-detail", taskId: "task-9" },
      actionLabel: "Review task",
      read: false,
    },
    {
      key: "run:run-failed-1",
      category: "needs_action",
      kind: "measurement_failed",
      title: "Measurement failed",
      description: "Unable to complete this measurement run.",
      evidenceTitle: "Citation run",
      evidenceType: "Measurement run",
      occurredAt: "2026-09-11T13:12:00.000Z",
      target: { kind: "visibility-evidence" },
      actionLabel: "View results",
      read: false,
    },
    {
      key: "run:run-succeeded-1",
      category: "updates",
      kind: "results_ready",
      title: "Results ready",
      description: "New measurement results are available (11 of 40 checks cited).",
      evidenceTitle: "Citation run",
      evidenceType: "Measurement run",
      occurredAt: "2026-09-10T09:41:00.000Z",
      target: { kind: "visibility-evidence" },
      actionLabel: "View results",
      read: true,
    },
    {
      key: "alert:alert-1",
      category: "updates",
      kind: "visibility_drop",
      title: "Visibility dropped",
      description: "Visibility dropped 10 pts (from 45% to 35%) since the last run.",
      evidenceTitle: "Citation run result",
      evidenceType: "Measurement change",
      occurredAt: "2026-09-09T16:03:00.000Z",
      target: { kind: "visibility-evidence" },
      actionLabel: "View results",
      read: true,
    },
    {
      key: "task_award:award-1",
      category: "completed",
      kind: "task_completed",
      title: "Task completed",
      description: '"Correct the service description" was verified and earned 40 work points.',
      evidenceTitle: "Correct the service description",
      evidenceType: "Task · Verified",
      occurredAt: "2026-09-08T09:16:00.000Z",
      target: { kind: "task-detail", taskId: "task-2" },
      actionLabel: "View task",
      read: true,
    },
  ],
  settings: {
    emailEnabled: true,
    slackEnabled: false,
    slackConnected: false,
    weeklyReportEnabled: true,
  },
};
