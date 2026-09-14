import type { Board33Data } from "./Screen";

const measured = <T>(value: T) => ({ kind: "measured" as const, value });

export const board33Fixture: Board33Data = {
  brandId: "brand-venture-pr",
  mode: "guided",
  brand: { name: "VenturePR" },
  baseline: {
    measuredDate: measured("Sep 12, 2026"),
    mentionCount: measured(18),
    mentionDenominator: measured(40),
    mentionRate: measured(45),
    failedCount: measured(6),
    failedDenominator: measured(46),
  },
  recommendedTask: {
    title: measured("Review and correct the service description"),
    points: measured(40),
    reason: measured(
      "Most engines mention VenturePR, but the service description page disagrees with the approved facts.",
    ),
  },
  progress: {
    level: 1,
    levelName: "Start",
    points: 0,
    nextLevelPoints: 160,
  },
};
