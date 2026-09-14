import { measured, type Board17Data } from "./Screen";

const chart = measured({
  labels: ["Aug 29", "Sep 1", "Sep 4", "Sep 7", "Sep 10", "Sep 12"],
  current: [7, 9, 7, 8, 11, 9, 11, 12, 12, 12, 13, 13, 11, 13, 13, 15],
  baseline: [4, 4, 4, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6],
});

export const board17Fixture: Board17Data = {
  navigation: { brandId: "fixture-venturepr", mode: "guided" },
  brand: { name: measured("VenturePR") },
  experiment: {
    title: measured("Test whether clearer service evidence improves answers"),
    status: measured("Running"),
    stages: measured([
      { label: "1. Baseline complete", caption: measured("2026-08-26"), status: "completed" },
      { label: "2. Change verified", caption: measured("2026-08-29"), status: "completed" },
      {
        label: "3. Observation active",
        caption: measured("2026-08-29 – 2026-09-12"),
        status: "active",
      },
      {
        label: "4. Review result pending",
        caption: measured("From 2026-09-16"),
        status: "pending",
      },
    ]),
    questionSetName: measured("Approved question set"),
    questionCount: measured(40),
    questionCategories: measured(["customer", "product", "comparison"]),
    engines: measured(["ChatGPT", "Claude", "Perplexity"]),
    baselineStart: measured("2026-08-12"),
    baselineEnd: measured("2026-08-26"),
    changedPage: measured("/services"),
    observationStart: measured("2026-08-29"),
    observationEnd: measured("2026-09-12"),
    nextMeasurement: measured("2026-09-16"),
    successThreshold: measured(6),
    baselineMentions: measured(18),
    currentMentions: measured(21),
    baselineDenominator: measured(40),
    currentDenominator: measured(40),
    chart,
    conclusion: measured("Too early to conclude"),
    conclusionDetail: measured(
      "Observation is in progress. Continue collecting data through Sep 12, 2026.",
    ),
    log: measured([
      {
        date: measured("2026-08-26"),
        event: measured("Baseline complete"),
        details: measured("Measured 18 of 40 mentions"),
        evidence: measured({ label: "View results", path: "/v2/visibility" }),
      },
      {
        date: measured("2026-08-29"),
        event: measured("Change verified"),
        details: measured("Updated /services with clearer evidence"),
        evidence: measured({ label: "View page diff", path: "/v2/brand-facts" }),
      },
      {
        date: measured("2026-08-29"),
        event: measured("Observation started"),
        details: measured("Began 14-day measurement window"),
        evidence: measured(null),
      },
      {
        date: measured("2026-09-05"),
        event: measured("Midpoint check"),
        details: measured("20 of 40 mentions (+2)"),
        evidence: measured({ label: "View snapshot", path: "/v2/visibility" }),
      },
    ]),
    evidenceLimits: {
      questionCount: measured(40),
      engineCount: measured(3),
      geoAndLanguage: measured("Fixed (US, English)"),
      personalization: measured("Signed out / neutral"),
    },
    confounds: [
      { label: "No additional content changes", detail: measured("No other page edits detected") },
      { label: "No major brand campaigns", detail: measured("No PR spikes detected") },
    ],
  },
  nextMeasurement: { workPoints: measured(10) },
  sourceObservation: measured({
    measured: 40,
    cited: 21,
    failed: 0,
    observed: 40,
    mentionRate: 52.5,
    weeks: [],
  }),
};
