import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

// Lazy, matching client/src/App.tsx's workflow-spine imports.
const Report = lazy(() => import("@/pages/report"));

export const Route = createFileRoute("/_app/report")({
  component: () => <AuthenticatedRoute component={Report} />,
});
