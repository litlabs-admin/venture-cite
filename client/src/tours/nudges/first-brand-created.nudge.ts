// client/src/tours/nudges/first-brand-created.nudge.ts
import type { TourConfig } from "../types";
export const firstBrandCreatedNudge: TourConfig = {
  id: "first-brand-created",
  version: 1,
  scope: "perUser",
  // Anchor `brands.firstRow` renders on /brands and /setup?tab=brands.
  trigger: {
    kind: "predicate",
    evaluate: (ctx) => ctx.counts.brands >= 1,
    routes: ["/brands", "/setup"],
  },
  steps: [
    {
      id: "next",
      target: "brands.firstRow",
      attachTo: "bottom",
      title: "Brand created — what's next?",
      content:
        "Open the brand to add name variations, then connect AI engines under AI Visibility.",
    },
  ],
};
