// client/src/tours/nudges/first-citation-found.nudge.ts
import type { TourConfig } from "../types";
export const firstCitationFoundNudge: TourConfig = {
  id: "first-citation-found",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "predicate", evaluate: (ctx) => ctx.counts.citations >= 1 },
  steps: [
    {
      id: "celebrate",
      target: "citations.firstResult",
      attachTo: "top",
      title: "First citation captured",
      content: "Each citation shows the engine, prompt, and exact answer text. Click to expand.",
    },
  ],
};
