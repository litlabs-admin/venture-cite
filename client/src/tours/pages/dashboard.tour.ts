// client/src/tours/pages/dashboard.tour.ts
//
// Replayable tour for the Command Center (/, /dashboard). The page used
// to be called "Dashboard" — both /dashboard and / route to the same
// surface, but the heading in the AppShell context bar is now
// "Command Center" and the copy below has been refreshed to match.
//
// Manual trigger — only fires via the page-help "?" button or replay.
// The auto-firing onboarding tour is `global-welcome` (routes "/", "/dashboard").
import type { TourConfig } from "../types";

export const dashboardTour: TourConfig = {
  id: "dashboard",
  version: 2,
  scope: "perUser",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "intro",
      title: "Command Center",
      content:
        "Your daily home in VentureCite. One sentence + one number tells you where you stand on AI visibility; the Worklist below tells you what to do next.",
    },
    {
      id: "stats",
      target: "dashboard.stats",
      attachTo: "bottom",
      title: "The three KPIs",
      content: (ctx) =>
        `AI Visibility · This week · Cited checks. Real measured signals only — no estimates. You're tracking ${ctx.counts.brands} brand${ctx.counts.brands === 1 ? "" : "s"} and ${ctx.counts.articles} article${ctx.counts.articles === 1 ? "" : "s"} right now.`,
    },
    {
      id: "progress-ring",
      target: "dashboard.recommendations",
      attachTo: "top",
      title: "Worklist — what to do next",
      content:
        "A ranked, action-first feed: regressions, required setup, and suggested improvements. Required items can't be dismissed; the rest you can snooze for a week.",
    },
  ],
};
