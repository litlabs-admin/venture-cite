// client/src/tours/nudges/first-listicle-found.nudge.ts
//
// The `listicles.firstResult` data-tour-id literal lived on the standalone
// listicles surface that Wave 5a folded into /diagnose (Coverage). The new
// diagnose surface renders these differently, so the nudge is now
// content-only and positions as a modal.
import type { TourConfig } from "../types";
export const firstListicleFoundNudge: TourConfig = {
  id: "first-listicle-found",
  version: 2,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "tip",
      title: "Listicle opportunity",
      content:
        "These are pages where competitors are listed but you aren't. Click for outreach copy.",
    },
  ],
};
