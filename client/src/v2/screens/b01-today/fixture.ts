import type { Board01Data } from "./Screen";
import type { TodayValue } from "./shared/TodayLayout";

const measured = <T>(value: T): TodayValue<T> => ({ kind: "measured", value });

const chartPoints = [29, 30, 36, 37, 37, 45, 46, 44, 46, 42, 38, 36, 40, 45].map((y, index) => ({
  x: `2026-08-${String(index + 26).padStart(2, "0")}`,
  y,
}));

export const board01Fixture: Board01Data = {
  variant: "board01",
  brandId: "brand-venture-pr",
  mode: "guided",
  brand: { name: "VenturePR" },
  goal: measured("Help buyers find accurate information about VenturePR"),
  priorityTask: {
    icon: "doc",
    title: measured("Correct the service description"),
    points: measured(40),
    effortMinutes: measured(15),
    state: measured("Confirmed fact conflict"),
    detail: measured("Your services page says worldwide."),
    approvedDetail: measured("Your approved service region is India."),
    desiredResult: measured("The public page agrees with the approved facts."),
  },
  queuedTasks: [
    { icon: "map", title: measured("Improve your buyer guide"), points: measured(40) },
    { icon: "chart", title: measured("Review recent results"), points: measured(10) },
  ],
  visibility: {
    kind: "measured",
    measured: 40,
    mentioned: 18,
    failed: 2,
    mentionRate: 45,
    rangeLabel: "Aug 26 – Sep 8, 2026",
    chartPoints,
    xLabels: ["Aug 26", "Sep 1", "Sep 8"],
    note: measured("Latest sample: 40 successful answers · 2 failed attempts"),
  },
  progress: {
    level: measured(2),
    levelName: measured("Ready"),
    workPoints: measured(120),
    nextLevelPoints: measured(160),
    nextLevel: measured(3),
    nextLevelName: measured("Improve"),
    progressPercent: measured(75),
    pointsRemaining: measured(40),
    verifiedChanges: measured(1),
    requiredChanges: measured(2),
    changesRemaining: measured(1),
    status: measured("1 of 2 changes verified"),
  },
  waitingTask: {
    kind: "waiting",
    title: measured("Crawler access repaired"),
    points: measured(40),
  },
};
