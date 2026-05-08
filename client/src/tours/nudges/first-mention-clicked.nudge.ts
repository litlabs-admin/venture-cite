// client/src/tours/nudges/first-mention-clicked.nudge.ts
import type { TourConfig } from "../types";
export const firstMentionClickedNudge: TourConfig = {
  id: "first-mention-clicked",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "manual" }, // fired imperatively from MentionCard expand handler
  steps: [
    {
      id: "tip",
      target: "mentions.detail.thread",
      attachTo: "right",
      title: "Mention thread context",
      content:
        "Read the surrounding discussion to decide whether to engage. Use Open in Reddit/HN to reply.",
    },
  ],
};
