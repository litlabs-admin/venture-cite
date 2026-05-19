// client/src/tours/pages/citations.tour.ts
import type { TourConfig } from "../types";

export const citationsTour: TourConfig = {
  id: "citations",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "intro",
      title: "Citation runs",
      content:
        "Citation runs ask AI engines a set of prompts and record where (and whether) your brand is cited.",
    },
    {
      id: "prompts-tab",
      target: "citations.tab.prompts",
      attachTo: "bottom",
      title: "Prompts come first",
      content:
        "Add prompts that real users would ask AI engines. Quality of prompts drives quality of insight.",
    },
    {
      id: "results-tab",
      target: "citations.tab.results",
      attachTo: "bottom",
      title: "Results show up here",
      content:
        "After each run, see which engines cited you, the rank, and the surrounding context.",
    },
    {
      id: "schedule-tab",
      target: "citations.tab.schedule",
      attachTo: "bottom",
      title: "Schedule recurring runs",
      content: "Weekly runs surface trends. Daily runs are best for active campaigns.",
    },
  ],
};
