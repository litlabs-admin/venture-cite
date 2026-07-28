import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";
import { actSearchSchema } from "../-shared/searchSchemas";

// Lazy, matching client/src/App.tsx's workflow-spine imports.
const Act = lazy(() => import("@/pages/act"));

export const Route = createFileRoute("/_app/act")({
  validateSearch: actSearchSchema,
  component: () => <AuthenticatedRoute component={Act} />,
});
