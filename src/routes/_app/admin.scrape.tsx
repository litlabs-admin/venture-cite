import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

// Lazy, matching client/src/App.tsx.
const AdminScrapeRuns = lazy(() => import("@/pages/admin-scrape-runs"));

export const Route = createFileRoute("/_app/admin/scrape")({
  head: () => ({ meta: [{ title: "Recent scrapes — admin" }] }),
  component: () => <AuthenticatedRoute component={AdminScrapeRuns} />,
});
