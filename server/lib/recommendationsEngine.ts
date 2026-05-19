import type { Brand } from "@shared/schema";

export type RecommendationPriority = "P0" | "P1" | "P2";
export type RecommendationCategory = "setup" | "content" | "citations" | "signals" | "growth";

export type Recommendation = {
  /** Stable string id — part of the public contract. NEVER reuse an id
   *  for a different rule, because clients persist dismissed-ids in
   *  localStorage; reusing an id would mis-attribute a user's dismissal
   *  to the new rule. */
  id: string;
  title: string;
  why: string;
  ctaLabel: string;
  /** Deep-link to the relevant page. Starts with `/`. May include
   *  query params for actions (e.g. `?action=run`). */
  ctaHref: string;
  priority: RecommendationPriority;
  category: RecommendationCategory;
  /** P0 = false (blockers cannot be dismissed); P1/P2 = true. */
  dismissible: boolean;
};

export type RecommendationState = {
  brand: Brand | null;
  articleCount: number;
  promptCount: number;
  citationRunCount: number;
  /** Most recent run's citation rate as a fraction 0..1. Null if no
   *  runs completed yet. */
  citationRate: number | null;
  lastSignalsScanAt: Date | null;
  visibilityChecklistCompleted: number;
  visibilityChecklistTotal: number;
  competitorCount: number;
  communityPostCount: number;
  faqCount: number;
  /** Unresolved hallucinations (detected total − resolved). Drives the
   *  "correct hallucinations" action that deep-links into the Diagnose
   *  inspector where a grounded correction is drafted. */
  unresolvedHallucinationCount: number;
  /** Competitors the weekly auto-discovery added recently and not yet
   *  ignored. Makes that automation legible: it surfaces "review what I
   *  added" instead of silently mutating the tracked set. */
  autoDiscoveredCompetitorCount: number;
};

const SIGNALS_STALE_DAYS = 14;
const LOW_CITATION_RATE = 0.2;
const VISIBILITY_INCOMPLETE_THRESHOLD = 0.5;
const MAX_RECOMMENDATIONS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Pure function. Given a snapshot of brand state, returns the next
 *  3–5 recommendations in priority order (P0 first, then P1, then P2).
 *  No side effects — fully testable. */
export function getRecommendations(state: RecommendationState): Recommendation[] {
  const recs: Recommendation[] = [];
  const brandId = state.brand?.id;

  // ============ P0 (blockers) ============

  // 1. No brand → must create one before anything else works.
  if (state.brand === null) {
    recs.push({
      id: "create-brand",
      title: "Create your first brand",
      why: "Brand profiles are the foundation — every other feature attaches to one.",
      ctaLabel: "Create brand",
      ctaHref: "/setup?tab=brands",
      priority: "P0",
      category: "setup",
      dismissible: false,
    });
    return recs; // Nothing else makes sense without a brand.
  }

  // 2. Brand has no industry → all generated content + prompts are
  //    generic until industry is set.
  if (!state.brand.industry) {
    recs.push({
      id: "add-brand-industry",
      title: "Add your industry to brand profile",
      why: "Industry powers content tone, prompt generation, and competitor matching. Generic without it.",
      ctaLabel: "Edit brand",
      ctaHref: brandId ? `/setup?tab=brands&brandId=${brandId}` : "/setup?tab=brands",
      priority: "P0",
      category: "setup",
      dismissible: false,
    });
    return recs;
  }

  // 3. No articles → generate the first one.
  if (state.articleCount === 0) {
    recs.push({
      id: "generate-first-article",
      title: "Generate your first article",
      why: "AI engines need 3–5 published articles before citation checks have signal.",
      ctaLabel: "Generate article",
      ctaHref: `/act?tab=create&brandId=${brandId}`,
      priority: "P0",
      category: "content",
      dismissible: false,
    });
  }

  // 4. No prompts → can't run citation checks without them.
  if (state.promptCount === 0) {
    recs.push({
      id: "generate-citation-prompts",
      title: "Generate citation-check prompts",
      why: "Citation checks ask AI engines questions and look for your brand in the answers — you need prompts to ask.",
      ctaLabel: "Generate prompts",
      ctaHref: `/monitor?tab=citations&brandId=${brandId}&action=generate-prompts`,
      priority: "P0",
      category: "citations",
      dismissible: false,
    });
  }

  // 5. Has prompts but no runs → trigger the first one.
  if (state.promptCount > 0 && state.citationRunCount === 0) {
    recs.push({
      id: "run-first-citation-check",
      title: "Run your first citation check",
      why: "Establishes the baseline. Subsequent runs measure progress.",
      ctaLabel: "Run check",
      ctaHref: `/monitor?tab=citations&brandId=${brandId}&action=run`,
      priority: "P0",
      category: "citations",
      dismissible: false,
    });
  }

  // ============ P1 (improvements) ============

  // 5b. AI is actively stating things the fact sheet contradicts. Highest-
  //     value correction signal — first among P1 so it wins the 5-cap.
  //     Deep-links into the Diagnose inspector where a grounded correction
  //     is drafted (4b).
  if (state.unresolvedHallucinationCount > 0) {
    const n = state.unresolvedHallucinationCount;
    recs.push({
      id: "correct-hallucinations",
      title: `Correct ${n} AI hallucination${n === 1 ? "" : "s"} about your brand`,
      why: "AI engines are stating things your fact sheet contradicts. Draft a grounded correction and publish it.",
      ctaLabel: "Review & correct",
      ctaHref: `/diagnose?tab=hallucinations&brandId=${brandId}`,
      priority: "P1",
      category: "citations",
      dismissible: true,
    });
  }

  // 6. Low citation rate → fact sheet enables hallucination detection.
  if (state.citationRate !== null && state.citationRate < LOW_CITATION_RATE) {
    recs.push({
      id: "add-brand-fact-sheet",
      title: "Add a brand fact sheet to catch hallucinations",
      why: `Your citation rate is ${Math.round(state.citationRate * 100)}%. A fact sheet lets VentureCite check AI responses for inaccurate claims about your brand.`,
      ctaLabel: "Add facts",
      ctaHref: `/setup?tab=fact-sheet&brandId=${brandId}`,
      priority: "P1",
      category: "citations",
      dismissible: true,
    });
  }

  // 7. Low citation rate AND no FAQs → FAQs are highest-ROI for citation rate.
  if (
    state.citationRate !== null &&
    state.citationRate < LOW_CITATION_RATE &&
    state.faqCount === 0
  ) {
    recs.push({
      id: "optimize-faq",
      title: "Optimize your FAQ for AI engines",
      why: "Well-structured FAQs are one of the highest-ROI inputs for citation rate.",
      ctaLabel: "Open FAQ Manager",
      ctaHref: `/act?tab=faq&brandId=${brandId}`,
      priority: "P1",
      category: "signals",
      dismissible: true,
    });
  }

  // 8. Signals scan stale or never run.
  const signalsStale =
    state.lastSignalsScanAt === null ||
    Date.now() - state.lastSignalsScanAt.getTime() > SIGNALS_STALE_DAYS * MS_PER_DAY;
  if (signalsStale) {
    recs.push({
      id: "rerun-geo-signals",
      title: "Re-run GEO Signals scan",
      why:
        state.lastSignalsScanAt === null
          ? "GEO Signals scores chunkability, schema, and FAQ — never run for this brand."
          : `Last scan was ${Math.floor((Date.now() - state.lastSignalsScanAt.getTime()) / MS_PER_DAY)} days ago.`,
      ctaLabel: "Run scan",
      ctaHref: `/diagnose?tab=signals&brandId=${brandId}`,
      priority: "P1",
      category: "signals",
      dismissible: true,
    });
  }

  // 9. AI Visibility checklist <50% complete.
  if (
    state.visibilityChecklistTotal > 0 &&
    state.visibilityChecklistCompleted / state.visibilityChecklistTotal <
      VISIBILITY_INCOMPLETE_THRESHOLD
  ) {
    recs.push({
      id: "complete-visibility-checklist",
      title: `Complete your AI Visibility checklist (${state.visibilityChecklistCompleted}/${state.visibilityChecklistTotal} done)`,
      why: "Each item completed boosts the chance an AI cites you accurately.",
      ctaLabel: "Open checklist",
      ctaHref: "/setup?tab=visibility",
      priority: "P1",
      category: "setup",
      dismissible: true,
    });
  }

  // ============ P2 (growth) ============

  // 9b. The weekly auto-discovery added competitors — surface them for
  //     review (propose-don't-execute: the automation no longer silently
  //     mutates the tracked set; the user keeps/ignores per row where the
  //     competitors tab already supports it).
  if (state.autoDiscoveredCompetitorCount > 0) {
    const n = state.autoDiscoveredCompetitorCount;
    recs.push({
      id: "review-discovered-competitors",
      title: `Review ${n} auto-discovered competitor${n === 1 ? "" : "s"}`,
      why: "Our weekly scan added these from AI answers and citations. Keep the real ones, ignore false positives.",
      ctaLabel: "Review competitors",
      ctaHref: `/monitor?tab=competitors&brandId=${brandId}`,
      priority: "P2",
      category: "growth",
      dismissible: true,
    });
  }

  // 10. No competitors tracked.
  if (state.competitorCount === 0) {
    recs.push({
      id: "add-competitors",
      title: "Add competitors to track relative GEO performance",
      why: "Without competitors, you can't tell whether you're winning or just running in place.",
      ctaLabel: "Add competitors",
      ctaHref: `/monitor?tab=competitors&brandId=${brandId}`,
      priority: "P2",
      category: "growth",
      dismissible: true,
    });
  }

  // 11. No community engagement.
  if (state.communityPostCount === 0) {
    recs.push({
      id: "try-community-outreach",
      title: "Try Reddit outreach for AEO",
      why: "Posts you make today can show up in AI answers within 4–8 weeks — direct AEO signal.",
      ctaLabel: "Open Community",
      ctaHref: `/act?tab=community&brandId=${brandId}`,
      priority: "P2",
      category: "growth",
      dismissible: true,
    });
  }

  // ============ Cap output to 5, P0 first ============
  // Sort: priority weight (P0=0, P1=1, P2=2), then preserve insertion order
  // within priority via the index.
  const weight = { P0: 0, P1: 1, P2: 2 } as const;
  const indexed = recs.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => weight[a.r.priority] - weight[b.r.priority] || a.i - b.i);
  return indexed.slice(0, MAX_RECOMMENDATIONS).map(({ r }) => r);
}
