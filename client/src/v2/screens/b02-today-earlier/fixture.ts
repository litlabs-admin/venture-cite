import type { Board02Data } from "./Screen";
import type { TodayValue } from "../b01-today/shared/TodayLayout";

const measured = <T>(value: T): TodayValue<T> => ({ kind: "measured", value });

// Same real-calendar-date note as b01-today/fixture.ts: `chartPoints.x` is a
// categorical label, `fixtureWeeks.weekStart` is what the range control
// parses, so it needs a real date.
const RATES = [29, 30, 36, 37, 37, 45, 46, 44, 46, 42, 38, 36, 40, 45];
const chartPoints = RATES.map((y, index) => ({
  x: `2026-08-${String(index + 26).padStart(2, "0")}`,
  y,
}));

function isoDate(daysAfterAug26: number): string {
  const date = new Date(Date.UTC(2026, 7, 26));
  date.setUTCDate(date.getUTCDate() + daysAfterAug26);
  return date.toISOString().slice(0, 10);
}

const fixtureWeeks = RATES.map((y, index) => ({
  weekStart: isoDate(index),
  measured: 40,
  cited: Math.round((y / 100) * 40),
  failed: index === RATES.length - 1 ? 2 : 0,
  mentionRate: y,
}));

export const board02Fixture: Board02Data = {
  variant: "board02",
  brandId: "brand-venture-pr",
  mode: "guided",
  brand: { name: "VenturePR" },
  goal: measured("Help buyers find accurate information about VenturePR"),
  priorityTask: {
    icon: "doc",
    title: measured("Correct the outdated service description"),
    points: measured(40),
    effortMinutes: measured(15),
    state: measured("Confirmed factual conflict"),
    detail: measured("Your approved facts and the published page disagree."),
    approvedDetail: measured("Publish the approved service region."),
    desiredResult: measured("The public page agrees with the approved facts."),
  },
  queuedTasks: [
    { icon: "map", title: measured("Improve your buyer guide"), points: measured(40) },
    { icon: "chart", title: measured("Review the latest results"), points: measured(10) },
  ],
  visibility: {
    kind: "measured",
    measured: 40,
    mentioned: 18,
    failed: 2,
    mentionRate: 45,
    rangeLabel: "Last 14 days",
    chartPoints,
    xLabels: ["Aug 26", "Sep 1", "Sep 8"],
    note: measured("4 engines · 10 questions · 2 failed answers excluded"),
    weeks: fixtureWeeks,
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
