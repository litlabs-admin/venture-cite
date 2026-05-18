// client/src/tours/pages/brand-fact-sheet.tour.ts
import type { TourConfig } from "../types";

export const brandFactSheetTour: TourConfig = {
  id: "brand-fact-sheet",
  version: 1,
  scope: "perUser",
  // Replay-only. The legacy /brand-fact-sheet route 301s into the spine
  // (/setup?tab=fact-sheet), so a route auto-fire can never land; and
  // auto-firing on the tabbed setup shell when the user may be on a
  // different tab would be wrong. Reachable via the page help button,
  // matching every other page tour.
  trigger: { kind: "manual" },
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
