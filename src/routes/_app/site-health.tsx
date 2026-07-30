import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

// Site Health detail — destination of the dashboard's Site Health panel's
// "Optimize" link. Its own page, matching the reference's /optimize.
const SiteHealthPage = lazy(() => import("@/pages/site-health"));

export const Route = createFileRoute("/_app/site-health")({
  component: () => <AuthenticatedRoute component={SiteHealthPage} />,
});
