import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";
import { diagnoseSearchSchema } from "../-shared/searchSchemas";

// Lazy, matching client/src/App.tsx's workflow-spine imports.
const Diagnose = lazy(() => import("@/pages/diagnose"));

export const Route = createFileRoute("/_app/diagnose")({
  validateSearch: diagnoseSearchSchema,
  component: () => <AuthenticatedRoute component={Diagnose} />,
});
