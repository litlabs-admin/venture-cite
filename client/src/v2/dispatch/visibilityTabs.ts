import type { BoardId } from "@/v2/contracts/screen";

export type VisibilityTab = {
  label: string;
  route: string;
  board: BoardId;
};

// The Visibility area's top-level tab strip, shared by every screen under
// /v2/visibility (and, for Competitors, the diagnostics area it actually
// lives in). Every entry is a real route - LIVE-RULES forbids a tab that
// says "Soon" - and every route below already has a route file and a board.
// Citations, Buyer questions, Competitors and Report are built by other
// agents in this program; this file only links to them.
export const VISIBILITY_TABS = [
  { label: "Overview", route: "/v2/visibility", board: "b08" },
  { label: "Answers", route: "/v2/visibility/evidence", board: "b09" },
  { label: "Citations", route: "/v2/visibility/citations", board: "b37" },
  { label: "Buyer questions", route: "/v2/visibility/questions", board: "b35" },
  { label: "Competitors", route: "/v2/diagnostics/competitor-gap", board: "b38" },
  { label: "Results", route: "/v2/visibility/results", board: "b10" },
  { label: "Report", route: "/v2/visibility/report", board: "b20" },
  { label: "Outcome review", route: "/v2/visibility/outcome-review", board: "b21" },
] as const satisfies readonly VisibilityTab[];

export const VISIBILITY_QUESTION_TABS = [
  { label: "Questions", route: "/v2/visibility/questions", board: "b35" },
  { label: "Audiences", route: "/v2/visibility/questions", board: "b35" },
  { label: "Journey coverage", route: "/v2/visibility/questions", board: "b35" },
  { label: "Set health", route: "/v2/visibility/questions", board: "b35" },
] as const satisfies readonly VisibilityTab[];

export const VISIBILITY_CITATION_TABS = [
  { label: "Overview", route: "/v2/visibility", board: "b08" },
  { label: "Answer records", route: "/v2/visibility/citations", board: "b37" },
  { label: "Source domains", route: "/v2/visibility/citations", board: "b37" },
  { label: "History", route: "/v2/visibility/citations", board: "b37" },
] as const satisfies readonly VisibilityTab[];
