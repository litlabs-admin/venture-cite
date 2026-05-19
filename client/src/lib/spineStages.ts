// Single source of truth for spine-stage tab labels so the AppShell
// context-bar title (shellTitleFor) and the per-stage SpineShell tab strips
// cannot drift apart. The labels here MUST match the tab arrays in
// pages/{monitor,diagnose,act,setup}.tsx — those files keep their own arrays
// because they also carry the lucide icon + lazy Component per tab, which
// don't belong in this pure-data module.

export type SpineStage = {
  /** Route path of the stage. */
  path: string;
  /** Tab value used when `?tab` is absent or invalid (mirrors the stage
   *  page's SpineShell `defaultTab`). */
  defaultTab: string;
  /** `?tab` value → human label, shown as the AppShell context-bar title. */
  labels: Record<string, string>;
};

export const SPINE_STAGES: SpineStage[] = [
  {
    path: "/monitor",
    defaultTab: "overview",
    labels: {
      overview: "Overview",
      citations: "Citations",
      competitors: "Competitors",
      trends: "Trends",
      mentions: "Mentions",
    },
  },
  {
    path: "/diagnose",
    defaultTab: "hallucinations",
    labels: {
      hallucinations: "Hallucinations",
      signals: "Signals",
      crawler: "Crawler",
      issues: "Issues",
    },
  },
  {
    path: "/act",
    defaultTab: "create",
    labels: {
      create: "Create",
      library: "Library",
      keywords: "Keywords",
      "geo-assets": "GEO Assets",
      faq: "FAQ",
      community: "Community",
    },
  },
  {
    path: "/setup",
    defaultTab: "brands",
    labels: {
      brands: "Brands",
      "fact-sheet": "Fact Sheet",
      visibility: "Visibility Checklist",
    },
  },
];

/** Standalone routes that render the same surface as a spine tab. AppShell
 *  titles them with the equivalent tab label so they read consistently with
 *  their `/stage?tab=` twin. */
export const STANDALONE_TITLES: Record<string, string> = {
  "/content": "Create",
  "/articles": "Library",
  "/keyword-research": "Keywords",
  "/brands": "Brands",
};

/**
 * Resolve the AppShell context-bar title for a pathname + `?tab` value.
 * Returns null for routes the shell does not own (those keep their own
 * in-page header). Command Center and Report are handled directly in
 * AppShell; this covers the four spine stages and their standalone twins.
 */
export function spineTitleFor(pathname: string, tab: string | null): string | null {
  const stage = SPINE_STAGES.find((s) => s.path === pathname);
  if (stage) {
    const key = tab && stage.labels[tab] ? tab : stage.defaultTab;
    return stage.labels[key] ?? null;
  }
  if (pathname === "/content" || pathname.startsWith("/content/")) {
    return STANDALONE_TITLES["/content"];
  }
  return STANDALONE_TITLES[pathname] ?? null;
}

/**
 * Resolve which replayable page tour (client/src/tours/pages/*) belongs to
 * the surface a user is currently on, so AppShell's "?" help button can
 * replay the right tour on every page instead of only the dashboard.
 *
 * Keyed off the same (pathname, ?tab) pair as spineTitleFor and the same
 * defaultTab fallback, so the help button and the title can never name
 * different surfaces. Returns undefined where no page tour exists (the
 * help button then falls back to the AI tutor, which is intended).
 *
 * Tour ids must exist in client/src/tours/registry.ts.
 */
export function pageTourFor(pathname: string, tab: string | null): string | undefined {
  if (pathname === "/" || pathname === "/dashboard") return "dashboard";
  if (pathname === "/brands") return "brands";

  const stage = SPINE_STAGES.find((s) => s.path === pathname);
  if (!stage) return undefined;
  const key = tab && stage.labels[tab] ? tab : stage.defaultTab;

  if (pathname === "/setup") {
    if (key === "brands") return "brands";
    if (key === "fact-sheet") return "brand-fact-sheet";
    if (key === "visibility") return "ai-visibility";
  }
  if (pathname === "/monitor" && key === "citations") return "citations";
  if (pathname === "/act" && key === "geo-assets") return "geo-tools";
  return undefined;
}
