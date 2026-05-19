// client/src/tours/nudges/first-scan-complete.nudge.ts
import type { TourConfig } from "../types";

export const firstScanCompleteNudge: TourConfig = {
  id: "first-scan-complete",
  version: 1,
  scope: "perBrand",
  // Anchor `mentions.firstResult` lives on the Monitor → Mentions tab.
  trigger: { kind: "predicate", evaluate: (ctx) => ctx.counts.mentions >= 1, routes: ["/monitor"] },
  steps: [
    {
      id: "celebrate",
      target: "mentions.firstResult",
      attachTo: "top",
      title: "Your first mention",
      content: "Tap any row to see the post, the surrounding thread, and the discovered mention.",
    },
  ],
};
