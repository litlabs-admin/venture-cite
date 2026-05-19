// client/src/tours/nudges/first-prompt-added.nudge.ts
import type { TourConfig } from "../types";
export const firstPromptAddedNudge: TourConfig = {
  id: "first-prompt-added",
  version: 1,
  scope: "perBrand",
  // Anchor `prompts.runButton` lives on the Monitor → Citations tab.
  trigger: { kind: "predicate", evaluate: (ctx) => ctx.counts.prompts >= 1, routes: ["/monitor"] },
  steps: [
    {
      id: "tip",
      target: "prompts.runButton",
      attachTo: "bottom",
      title: "Run a citation check",
      content: "Click here to test this prompt across all connected AI engines now.",
    },
  ],
};
