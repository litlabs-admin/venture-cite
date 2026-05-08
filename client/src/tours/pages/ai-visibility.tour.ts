// client/src/tours/pages/ai-visibility.tour.ts
import type { TourConfig } from "../types";

export const aiVisibilityTour: TourConfig = {
  id: "ai-visibility",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "intro",
      title: "Connect AI engines",
      content:
        "Walk through each step to connect ChatGPT, Claude, Perplexity, and Gemini for citation tracking.",
    },
    {
      id: "engines",
      target: "aiVisibility.engineList",
      attachTo: "right",
      title: "One engine at a time",
      content:
        "Expand each engine to see the connection steps. Order doesn't matter; you can pause and resume.",
    },
  ],
};
