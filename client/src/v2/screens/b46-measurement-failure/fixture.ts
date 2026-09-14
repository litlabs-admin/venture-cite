import type { Board46Data } from "./Screen";

const chartPoints = [45, 44, 42, 40, 38, 40, 45].map((y, index) => ({
  x: `2026-08-2${index}`,
  y,
}));

export const board46Fixture: Board46Data = {
  brandId: "brand-venture-pr",
  mode: "guided",
  brand: { name: "VenturePR" },
  alert: {
    failedCount: 4,
    observedCount: 42,
    isStale: true,
    staleAsOfLabel: "more than 14 days old (last observed Aug 26)",
  },
  lastVerified: {
    kind: "measured",
    measured: 40,
    mentioned: 18,
    failed: 2,
    mentionRate: 45,
    rangeLabel: "Aug 20 – Aug 26, 2026",
    chartPoints,
    xLabels: ["Aug 20", "Aug 23", "Aug 26"],
    note: { kind: "measured", value: "Latest sample: 40 successful answers · 2 failed attempts" },
    weeks: [
      { weekStart: "2026-08-20", measured: 40, cited: 18, failed: 2, mentionRate: 45 },
      { weekStart: "2026-08-26", measured: 40, cited: 18, failed: 2, mentionRate: 45 },
    ],
  },
};
