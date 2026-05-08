// client/src/tours/nudges/first-listicle-found.nudge.ts
import type { TourConfig } from "../types";
export const firstListicleFoundNudge: TourConfig = {
  id: "first-listicle-found",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "tip",
      target: "listicles.firstResult",
      attachTo: "top",
      title: "Listicle opportunity",
      content:
        "These are pages where competitors are listed but you aren't. Click for outreach copy.",
    },
  ],
};
