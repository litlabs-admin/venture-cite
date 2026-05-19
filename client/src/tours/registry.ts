import type { TourConfig } from "./types";
import { globalWelcomeTour } from "./global-welcome.tour";
import { dashboardTour } from "./pages/dashboard.tour";
import { brandsTour } from "./pages/brands.tour";
import { aiVisibilityTour } from "./pages/ai-visibility.tour";
import { citationsTour } from "./pages/citations.tour";
import { geoToolsTour } from "./pages/geo-tools.tour";
import { brandFactSheetTour } from "./pages/brand-fact-sheet.tour";
import { firstScanCompleteNudge } from "./nudges/first-scan-complete.nudge";
import { firstArticleGeneratedNudge } from "./nudges/first-article-generated.nudge";
import { firstPromptAddedNudge } from "./nudges/first-prompt-added.nudge";
import { firstBrandCreatedNudge } from "./nudges/first-brand-created.nudge";

export const TOURS: Record<string, TourConfig> = {
  [globalWelcomeTour.id]: globalWelcomeTour,
  [dashboardTour.id]: dashboardTour,
  [brandsTour.id]: brandsTour,
  [aiVisibilityTour.id]: aiVisibilityTour,
  [citationsTour.id]: citationsTour,
  [geoToolsTour.id]: geoToolsTour,
  [brandFactSheetTour.id]: brandFactSheetTour,
  [firstScanCompleteNudge.id]: firstScanCompleteNudge,
  [firstArticleGeneratedNudge.id]: firstArticleGeneratedNudge,
  [firstPromptAddedNudge.id]: firstPromptAddedNudge,
  [firstBrandCreatedNudge.id]: firstBrandCreatedNudge,
};

export function getTour(id: string): TourConfig | undefined {
  return TOURS[id];
}

export function listTourIds(): string[] {
  return Object.keys(TOURS);
}

export function listAllTargets(): string[] {
  const targets = new Set<string>();
  for (const tour of Object.values(TOURS)) {
    for (const step of tour.steps) {
      if (step.target) targets.add(step.target);
    }
  }
  return Array.from(targets);
}
