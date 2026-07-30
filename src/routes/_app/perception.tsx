import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

// Perception detail — destination of the dashboard Perception panel's
// "Details ›" link, matching the reference's own /perception page.
const PerceptionPage = lazy(() => import("@/pages/perception"));

export const Route = createFileRoute("/_app/perception")({
  component: () => <AuthenticatedRoute component={PerceptionPage} />,
});
