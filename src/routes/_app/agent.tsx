import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRailRoute } from "../-shared/routeGates";
import { askSearchSchema } from "../-shared/searchSchemas";

// Ask workspace (docs/ask-feature/04-implementation-plan.md §7). Lazy,
// matching the existing workflow-spine imports (monitor.tsx etc). Uses
// AuthenticatedRailRoute, not AuthenticatedRoute - see that gate's own
// comment for why: the AI Tutor's floating pill would otherwise sit on top
// of the Ask composer.
const Agent = lazy(() => import("@/pages/agent"));

export const Route = createFileRoute("/_app/agent")({
  validateSearch: askSearchSchema,
  component: () => <AuthenticatedRailRoute component={Agent} />,
});
