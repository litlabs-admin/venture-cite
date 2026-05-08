// client/src/tours/nudges/empty-citations.nudge.ts
import type { TourConfig } from "../types";
export const emptyCitationsNudge: TourConfig = {
  id: "empty-citations",
  version: 1,
  scope: "perBrand",
  trigger: {
    kind: "predicate",
    evaluate: (ctx) => ctx.counts.citations === 0 && ctx.counts.prompts === 0,
  },
  steps: [
    {
      id: "tip",
      target: "citations.tab.prompts",
      attachTo: "bottom",
      title: "Add a prompt to start",
      content: "Citations come from running prompts. Start by adding a prompt in this tab.",
    },
  ],
};
