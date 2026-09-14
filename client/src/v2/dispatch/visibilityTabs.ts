import type { BoardId } from "@/v2/contracts/screen";

export type VisibilityTab = {
  label: string;
  route: string;
  board: BoardId;
};

export const VISIBILITY_TABS = [
  { label: "Overview", route: "/v2/visibility", board: "b08" },
  { label: "Answers", route: "/v2/visibility/evidence", board: "b09" },
  { label: "Citations", route: "/v2/visibility/citations", board: "b37" },
  { label: "Competitors", route: "/v2/diagnostics/competitor-gap", board: "b38" },
  { label: "Results", route: "/v2/visibility/results", board: "b10" },
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
