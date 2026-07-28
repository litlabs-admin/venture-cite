import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";
import { setupSearchSchema } from "../-shared/searchSchemas";

// Lazy, matching client/src/App.tsx's workflow-spine imports.
const Setup = lazy(() => import("@/pages/setup"));

export const Route = createFileRoute("/_app/setup")({
  validateSearch: setupSearchSchema,
  component: () => <AuthenticatedRoute component={Setup} />,
});
