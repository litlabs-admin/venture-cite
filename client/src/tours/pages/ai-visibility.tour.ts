// client/src/tours/pages/ai-visibility.tour.ts
//
// The standalone /ai-visibility page was retired pre-this-spec (its checklist
// lives at /setup?tab=visibility now). The `aiVisibility.engineList`
// data-tour-id literal no longer renders, so this tour is content-only
// (no `target:` field on any step) and positions as a modal — same pattern
// adopted by geo-tools.tour.ts and citations.tour.ts.
import type { TourConfig } from "../types";

export const aiVisibilityTour: TourConfig = {
  id: "ai-visibility",
  version: 2,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "intro",
      title: "Connect AI engines",
      content:
        "Walk through each step to connect ChatGPT, Claude, Perplexity, and Gemini for citation tracking. The checklist now lives under Setup → Visibility Checklist.",
    },
    {
      id: "engines",
      title: "One engine at a time",
      content:
        "Work through each engine's connection steps. Order doesn't matter; you can pause and resume.",
    },
  ],
};
