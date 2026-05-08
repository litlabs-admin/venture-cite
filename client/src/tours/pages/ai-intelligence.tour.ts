// client/src/tours/pages/ai-intelligence.tour.ts
import type { TourConfig } from "../types";

export const aiIntelligenceTour: TourConfig = {
  id: "ai-intelligence",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "intro",
      title: "AI Intelligence",
      content:
        "Six lenses on how AI engines treat your brand: share-of-answer, competitors, citation quality, hallucinations, trends, alerts.",
    },
    {
      id: "share-tab",
      target: "aiIntel.tab.share",
      attachTo: "bottom",
      title: "Share-of-answer",
      content: "What percentage of relevant answers cite you vs. competitors? Start here.",
    },
    {
      id: "hallucinations-tab",
      target: "aiIntel.tab.hallucinations",
      attachTo: "bottom",
      title: "Hallucinations",
      content: "When an AI invents facts about your brand, this tab catches it. Check weekly.",
    },
  ],
};
