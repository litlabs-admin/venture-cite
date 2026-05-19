// client/src/tours/nudges/first-citation-found.nudge.ts
//
// The `citations.firstResult` data-tour-id literal lived on the standalone
// /citations page that Wave 5a folded into /monitor. The new monitor surface
// renders citations differently, so the nudge is now content-only and
// positions as a modal — same pattern as citations.tour.ts.
import type { TourConfig } from "../types";
export const firstCitationFoundNudge: TourConfig = {
  id: "first-citation-found",
  version: 2,
  scope: "perBrand",
  trigger: { kind: "predicate", evaluate: (ctx) => ctx.counts.citations >= 1 },
  steps: [
    {
      id: "celebrate",
      title: "First citation captured",
      content: "Each citation shows the engine, prompt, and exact answer text. Click to expand.",
    },
  ],
};
