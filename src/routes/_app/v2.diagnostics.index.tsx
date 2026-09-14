import { createFileRoute } from "@tanstack/react-router";
import { Board18Route } from "@/v2/screens/b18-site-health/Route";

// The index redirects to site health rather than rendering its own page:
// Diagnostics has no "overview" board of its own, and site health is the
// first tab in the diagnostics strip (`diagnosticsTabs.ts`).
export const Route = createFileRoute("/_app/v2/diagnostics/")({
  component: Board18Route,
  staticData: { v2Shell: "expert", v2Board: "b18" },
});
