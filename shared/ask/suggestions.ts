// Ask's fixed suggestion palette (04-implementation-plan.md §6). A template
// list, NOT generated per run - Trakkr's own four (01-trakkr-teardown.md
// §1.2) hold no brand-specific numbers, which is the tell that they are
// templated too. Row 4 substitutes Trakkr's unanswerable "what bots
// crawled us this week" for the honest question our check_crawler_access
// tool can actually answer (round-2 decision 6,
// docs/ask-feature/06-crawler-worker-spec.md).
//
// ONE definition, shared by the server (GET /api/ask/suggestions,
// server/routes/ask.ts - kept for any other caller of that route) and the
// client (CommandPalette.tsx's Ask window, AskEmptyState.tsx's "Explore
// your visibility" list) - the client renders it with no fetch at all,
// which is what makes the Ask window's empty-input suggestions appear
// instantly instead of waiting on a round trip for four sentences that
// never depend on the brand.
export type AskSuggestionIcon = "trending-up" | "share" | "target" | "radar";

export type AskSuggestion = {
  icon: AskSuggestionIcon;
  text: string;
};

export const ASK_SUGGESTION_PALETTE: readonly AskSuggestion[] = [
  { icon: "trending-up", text: "why has our AI visibility moved this week?" },
  { icon: "share", text: "show me where competitors are outranking us" },
  { icon: "target", text: "start tracking a new prompt we should be ranking on" },
  { icon: "radar", text: "can AI crawlers reach our site?" },
];
