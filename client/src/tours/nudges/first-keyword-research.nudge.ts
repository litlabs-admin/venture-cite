// client/src/tours/nudges/first-keyword-research.nudge.ts
import type { TourConfig } from "../types";
export const firstKeywordResearchNudge: TourConfig = {
  id: "first-keyword-research",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "tip",
      target: "keywords.firstRow",
      attachTo: "top",
      title: "Keyword research",
      content:
        "Each row is a query AI engines might be asked. Click to generate a citation-targeted article.",
    },
  ],
};
