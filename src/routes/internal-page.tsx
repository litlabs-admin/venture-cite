import { createFileRoute } from "@tanstack/react-router";
import InternalPage from "@/pages/internal-page";
import { AdminBareRoute } from "./-shared/routeGates";

// The client redirects unauthenticated users to sign in and non-administrators
// to the dashboard. The API checks the same administrator rule.
export const Route = createFileRoute("/internal-page")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Board - VentureCite" },
      { name: "description", content: "The work board for VentureCite." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <AdminBareRoute component={InternalPage} />,
});
