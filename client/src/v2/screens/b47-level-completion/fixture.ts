import type { Board47Data } from "./Screen";

export const board47Fixture: Board47Data = {
  brandId: "brand-venture-pr",
  mode: "guided",
  brand: { name: "VenturePR" },
  completion: {
    level: 3,
    levelName: "Improve",
    verifiedWorkPoints: 320,
    milestoneLabels: [
      "Goal chosen and queue reviewed",
      "Measurement baseline recorded",
      "Evidenced changes verified",
    ],
  },
  nextLevel: { level: 4, name: "Decide" },
  nextTask: { title: "Explore Level 4 learning", points: 20 },
};
