// client/src/tours/nudges/first-prompt-added.nudge.ts
import type { TourConfig } from "../types";
export const firstPromptAddedNudge: TourConfig = {
  id: "first-prompt-added",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "predicate", evaluate: (ctx) => ctx.counts.prompts >= 1 },
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
