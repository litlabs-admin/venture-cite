import type {
  Board38CompetitorMeasurement,
  Board38Competitor,
  Board38Data,
  Board38Measurement,
  Board38Prompt,
} from "./Screen";

// Approved-canvas preview data (docs/design/venturecite-calm-analytics-missing-desktop/13-competitor-gap.png
// and fragment-41-competitor-gap.html): a frozen 30-day comparison of
// VenturePR against five named PR competitors across eight tracked buyer
// questions. This is raw per-check data - the same shape the live adapter
// produces - so the screen's own aggregation renders identically for both
// the preview and the live page. It is not required to reproduce the
// canvas mock's exact percentages (those were hand-typed for the static
// render and are not internally derivable from one shared denominator);
// it reproduces the same competitors, the same gap-question count, and the
// same structure.

const daysAgo = (n: number): string => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

const prompts: Board38Prompt[] = [
  { id: "p1", text: "What are the best startup PR services in India?", category: "Comparison" },
  { id: "p2", text: "How much do PR agencies charge for startups in India?", category: "Pricing" },
  { id: "p3", text: "How to choose a PR agency for a startup?", category: "Comparison" },
  {
    id: "p4",
    text: "Which PR firms have strong media relations in India?",
    category: "Comparison",
  },
  { id: "p5", text: "What results can a startup expect from PR services?", category: "Outcomes" },
  { id: "p6", text: "How do I measure PR ROI as a startup?", category: "Outcomes" },
  { id: "p7", text: "What makes a PR agency startup-friendly?", category: "Comparison" },
  { id: "p8", text: "How do startups build media relationships in India?", category: "Comparison" },
];

const competitors: Board38Competitor[] = [
  { id: "c-edelman", name: "Edelman", nameVariations: [] },
  { id: "c-weber", name: "Weber Shandwick", nameVariations: ["Weber"] },
  { id: "c-value360", name: "Value 360", nameVariations: ["Value 360 Communications"] },
  { id: "c-avian", name: "Avian WE", nameVariations: ["Avian"] },
  { id: "c-prnewswire", name: "PR Newswire", nameVariations: ["PRNewswire"] },
];

const ENGINES = ["ChatGPT", "Claude"] as const;

function brandRow(
  promptId: string,
  engine: string,
  age: number,
  isCited: boolean,
  named: readonly { name: string; cited: boolean }[],
): Board38Measurement {
  return {
    brandPromptId: promptId,
    aiPlatform: engine,
    checkedAt: daysAgo(age),
    isCited,
    rank: isCited ? 2 : null,
    mentionedBrands: [
      { name: "VenturePR", cited: isCited, rank: isCited ? 2 : null },
      ...named.map((n) => ({ name: n.name, cited: n.cited, rank: n.cited ? 1 : null })),
    ],
  };
}

// p1-p5: VenturePR absent, at least one competitor cited - these are the
// board's gap rows.
const measurements: Board38Measurement[] = [
  ...ENGINES.map((engine) =>
    brandRow("p1", engine, 4, false, [
      { name: "Edelman", cited: true },
      { name: "Weber Shandwick", cited: true },
    ]),
  ),
  ...ENGINES.map((engine) =>
    brandRow("p2", engine, 6, false, [
      { name: "PR Newswire", cited: true },
      { name: "Value 360", cited: true },
    ]),
  ),
  ...ENGINES.map((engine) =>
    brandRow("p3", engine, 8, false, [
      { name: "Weber Shandwick", cited: true },
      { name: "Edelman", cited: true },
      { name: "Avian WE", cited: true },
    ]),
  ),
  ...ENGINES.map((engine) =>
    brandRow("p4", engine, 10, false, [
      { name: "Edelman", cited: true },
      { name: "Weber Shandwick", cited: true },
    ]),
  ),
  ...ENGINES.map((engine) =>
    brandRow("p5", engine, 12, false, [
      { name: "Value 360", cited: true },
      { name: "Avian WE", cited: true },
      { name: "PR Newswire", cited: true },
    ]),
  ),
  // p6, p7: VenturePR wins these.
  ...ENGINES.map((engine) => brandRow("p6", engine, 5, true, [{ name: "Edelman", cited: false }])),
  ...ENGINES.map((engine) => brandRow("p7", engine, 7, true, [])),
  // Previous-period rows (31-60 days ago) so change history has a real
  // comparison. VenturePR was cited less often back then.
  brandRow("p1", "ChatGPT", 40, false, [{ name: "Edelman", cited: true }]),
  brandRow("p6", "ChatGPT", 45, false, [{ name: "Edelman", cited: true }]),
  // p8 has no measurements at all - it is excluded from the scope.
];

function competitorRow(
  competitorId: string,
  promptId: string,
  engine: string,
  age: number,
  isCited: boolean,
  url: string | null,
): Board38CompetitorMeasurement {
  return {
    competitorId,
    brandPromptId: promptId,
    aiPlatform: engine,
    checkedAt: daysAgo(age),
    isCited,
    rank: isCited ? 1 : null,
    citingOutletUrl: isCited ? url : null,
    citationContext: isCited
      ? `${competitorId} is cited as a strong option for this question.`
      : null,
  };
}

const competitorMeasurements: Board38CompetitorMeasurement[] = [
  competitorRow(
    "c-edelman",
    "p1",
    "ChatGPT",
    4,
    true,
    "https://www.edelman.com/insights/startup-pr",
  ),
  competitorRow(
    "c-weber",
    "p1",
    "ChatGPT",
    4,
    true,
    "https://www.webershandwick.com/case-studies/startups",
  ),
  competitorRow(
    "c-prnewswire",
    "p2",
    "ChatGPT",
    6,
    true,
    "https://www.prnewswire.com/news/startup-pr-pricing",
  ),
  competitorRow(
    "c-value360",
    "p2",
    "ChatGPT",
    6,
    true,
    "https://www.value360.com/blog/startup-pricing",
  ),
  competitorRow(
    "c-weber",
    "p3",
    "Claude",
    8,
    true,
    "https://www.webershandwick.com/agency-selection",
  ),
  competitorRow(
    "c-edelman",
    "p3",
    "Claude",
    8,
    true,
    "https://www.edelman.com/insights/agency-selection",
  ),
  competitorRow(
    "c-avian",
    "p3",
    "Claude",
    8,
    true,
    "https://www.avianwe.com/blog/agency-selection",
  ),
  competitorRow(
    "c-edelman",
    "p4",
    "ChatGPT",
    10,
    true,
    "https://www.edelman.com/insights/media-relations",
  ),
  competitorRow(
    "c-weber",
    "p4",
    "ChatGPT",
    10,
    true,
    "https://www.webershandwick.com/media-relations",
  ),
  competitorRow("c-value360", "p5", "Claude", 12, true, "https://www.value360.com/blog/pr-results"),
  competitorRow("c-avian", "p5", "Claude", 12, true, "https://www.avianwe.com/blog/pr-results"),
  competitorRow(
    "c-prnewswire",
    "p5",
    "Claude",
    12,
    true,
    "https://www.prnewswire.com/news/pr-results",
  ),
  // Competitors also get checked (and sometimes not cited) on the
  // questions VenturePR wins, so their citation rate is not a flat 100%.
  competitorRow("c-edelman", "p6", "ChatGPT", 5, false, null),
  competitorRow("c-weber", "p7", "Claude", 7, false, null),
  // Previous-period rows for change history.
  competitorRow(
    "c-edelman",
    "p1",
    "ChatGPT",
    40,
    true,
    "https://www.edelman.com/insights/startup-pr",
  ),
];

export const board38Fixture: Board38Data = {
  navigation: { brandId: "brand-venture-pr", mode: "expert" },
  brandName: { kind: "measured", value: "VenturePR" },
  market: { kind: "measured", value: "India" },
  totalTrackedPrompts: { kind: "measured", value: prompts.length },
  prompts,
  competitors,
  measurements,
  competitorMeasurements,
};
