import type { LucideIcon } from "lucide-react";
import { Building2, PenLine, ScanEye, Target } from "lucide-react";

// Single source of truth for the 4 onboarding steps. Both the sidebar
// onboarding widget AND the dashboard onboarding ring read from this
// file — extract here so adding/removing a step touches one place.

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  link: string;
  linkText: string;
  icon: LucideIcon;
  /** Receives merged data from /api/onboarding-status + /api/brands +
   *  /api/articles. Returns true when this step is complete. */
  checkFn: (data: OnboardingData) => boolean;
}

// Loose typing: each query returns a different shape; the checkFns
// coerce defensively. Tightening this requires backend type exports we
// don't have today.
export type OnboardingData = {
  brands?: unknown[];
  articles?: unknown[];
  hasArticles?: boolean;
  visibilityVisited?: boolean;
  citationRunsCount?: number;
  citations?: unknown[];
  citedRankingsCount?: number;
};

export const STEPS: OnboardingStep[] = [
  {
    id: "brand",
    title: "Create your first brand",
    description:
      "Set up a brand profile so content can be personalized with your tone, values, and unique selling points.",
    link: "/setup?tab=brands",
    linkText: "Create brand",
    icon: Building2,
    checkFn: (d) => (d?.brands?.length || 0) > 0,
  },
  {
    id: "content",
    title: "Generate AI-optimized content",
    description:
      "Use the AI content generator to create articles designed to be cited by AI search engines.",
    link: "/act?tab=create",
    linkText: "Create content",
    icon: PenLine,
    checkFn: (d) => Boolean(d?.hasArticles) || (d?.articles?.length || 0) > 0,
  },
  {
    id: "visibility",
    title: "View the AI Visibility Guide",
    description:
      "Step-by-step recommendations to optimize your presence across ChatGPT, Claude, and other AI engines.",
    link: "/setup?tab=visibility",
    linkText: "View guide",
    icon: ScanEye,
    // Server-only — localStorage would leak across user accounts on the
    // same browser (e.g. logout + new signup would see the step pre-done).
    checkFn: (d) => Boolean(d?.visibilityVisited),
  },
  {
    id: "citation",
    title: "Run your first citation check",
    description:
      "Kick off an AI citation run so we can start tracking how often platforms mention your brand.",
    link: "/monitor?tab=citations",
    linkText: "Run check",
    icon: Target,
    // Done the moment the user triggers their first run — no need to wait
    // for an actual cited result.
    checkFn: (d) =>
      (d?.citationRunsCount || 0) > 0 ||
      (d?.citations?.length || 0) > 0 ||
      (d?.citedRankingsCount || 0) > 0,
  },
];

export function isOnboardingComplete(data: OnboardingData): boolean {
  return STEPS.every((step) => step.checkFn(data));
}

export function completedStepCount(data: OnboardingData): number {
  return STEPS.filter((step) => step.checkFn(data)).length;
}
