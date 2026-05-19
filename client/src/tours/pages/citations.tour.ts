// client/src/tours/pages/citations.tour.ts
//
// The standalone Citations page was folded into the unified /monitor surface
// (Wave 5a, "monitor-diagnose consolidation"). The 3-tab strip that carried
// the `citations.tab.prompts|results|schedule` data-tour-id literals no
// longer exists. This manual tour is now content-only (no `target:` field
// on any step) so it uses modal positioning, same pattern adopted by
// geo-tools.tour.ts post-/act-2b.
import type { TourConfig } from "../types";

export const citationsTour: TourConfig = {
  id: "citations",
  version: 2,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "intro",
      title: "Citation runs",
      content:
        "Citation runs ask AI engines a set of prompts and record where (and whether) your brand is cited. Everything lives under Monitor now — citations, competitors, trends, and mentions are one surface.",
    },
    {
      id: "prompts",
      title: "Prompts come first",
      content:
        "Add prompts that real users would ask AI engines. Quality of prompts drives quality of insight.",
    },
    {
      id: "results",
      title: "Results show up here",
      content:
        "After each run, see which engines cited you, the rank, and the surrounding context.",
    },
    {
      id: "schedule",
      title: "Schedule recurring runs",
      content: "Weekly runs surface trends. Daily runs are best for active campaigns.",
    },
  ],
};
