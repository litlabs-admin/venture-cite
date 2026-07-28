import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

// Lazy, matching client/src/App.tsx.
const Settings = lazy(() => import("@/pages/settings"));

export const Route = createFileRoute("/_app/settings")({
  component: () => <AuthenticatedRoute component={Settings} />,
});
