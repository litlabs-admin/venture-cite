// client/src/tours/pages/brand-fact-sheet.tour.ts
import type { TourConfig } from "../types";

export const brandFactSheetTour: TourConfig = {
  id: "brand-fact-sheet",
  version: 1,
  scope: "perUser",
  trigger: { kind: "route", routes: ["/brand-fact-sheet"] },
  steps: [
    {
      id: "run-progress",
      target: "fact-sheet.header",
      attachTo: "bottom",
      title: "Live scrape progress",
      content:
        "When a re-scrape is running, a progress strip appears here showing the current page and overall progress.",
    },
    {
      id: "diff-intro",
      target: "fact-sheet.diff",
      attachTo: "top",
      title: "Resolve conflicts",
      content:
        "When what you typed and what we found differ, we surface a side-by-side pair. Pick one, keep both, or merge.",
    },
  ],
};
