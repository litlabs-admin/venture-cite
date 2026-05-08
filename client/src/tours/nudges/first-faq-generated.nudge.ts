// client/src/tours/nudges/first-faq-generated.nudge.ts
import type { TourConfig } from "../types";
export const firstFaqGeneratedNudge: TourConfig = {
  id: "first-faq-generated",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "tip",
      target: "faq.firstResult",
      attachTo: "top",
      title: "FAQ generated",
      content:
        "Add this to your site under FAQ schema. AI engines weight FAQ-formatted Q&A heavily.",
    },
  ],
};
