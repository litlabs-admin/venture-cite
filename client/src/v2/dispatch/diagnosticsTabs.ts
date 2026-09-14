import type { BoardId } from "@/v2/contracts/screen";

export type DiagnosticsTab = {
  label: string;
  route: string;
  board: BoardId;
};

export const DIAGNOSTICS_TABS = [
  { label: "Site health", route: "/v2/diagnostics/site-health", board: "b18" },
  { label: "GEO signals", route: "/v2/diagnostics/geo-signals", board: "b12" },
  { label: "Perception", route: "/v2/diagnostics/perception", board: "b13" },
  { label: "Prompt diagnosis", route: "/v2/diagnostics/prompts", board: "b11" },
  { label: "Competitor gap", route: "/v2/diagnostics/competitor-gap", board: "b38" },
] as const satisfies readonly DiagnosticsTab[];
