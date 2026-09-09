import { createFileRoute } from "@tanstack/react-router";
import DiagnosticsPage from "@/v2/diagnostics/DiagnosticsPage";

// `/v2/diagnostics`.
//
// The dotted filename resolves to the nested path, so the route id is
// "/_app/v2/diagnostics" - the parent (`v2.tsx`) already carries the gate and
// the search schema, and neither is repeated here.
//
// The tab and the selected question are component state, not search params.
// Both select what to READ and neither mutates anything, so nothing is lost
// by their not surviving a reload; adding them to `v2SearchSchema` would put
// two more keys into a URL contract shared with the live dashboard for no
// behaviour this screen needs.
export const Route = createFileRoute("/_app/v2/diagnostics")({
  component: DiagnosticsPage,
});
