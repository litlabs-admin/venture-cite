import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";
import { monitorSearchSchema } from "../-shared/searchSchemas";

// Lazy, matching client/src/App.tsx's workflow-spine imports.
const Monitor = lazy(() => import("@/pages/monitor"));

export const Route = createFileRoute("/_app/monitor")({
  validateSearch: monitorSearchSchema,
  component: () => <AuthenticatedRoute component={Monitor} />,
});
