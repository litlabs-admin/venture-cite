// client/src/tours/pages/dashboard.tour.ts
import type { TourConfig } from "../types";

export const dashboardTour: TourConfig = {
  id: "dashboard",
  version: 1,
  scope: "perUser",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "intro",
      title: "Dashboard overview",
      content:
        "The dashboard summarizes brand health: visibility, citations, and recent activity. Use the brand selector at the top-left to switch contexts.",
    },
    {
      id: "progress-ring",
      target: "dashboard.progressRing",
      attachTo: "bottom",
      title: "Onboarding progress",
      content: "Track which setup steps you've completed. Click any step to jump there.",
    },
    {
      id: "stats",
      target: "dashboard.stats",
      attachTo: "top",
      title: "Top-level metrics",
      content: (ctx) =>
        `You currently have ${ctx.counts.brands} brand${ctx.counts.brands === 1 ? "" : "s"} and ${ctx.counts.articles} article${ctx.counts.articles === 1 ? "" : "s"}. These cards update in real time.`,
    },
  ],
};
