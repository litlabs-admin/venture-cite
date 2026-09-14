import { createFileRoute } from "@tanstack/react-router";
import { Board18Route } from "@/v2/screens/b18-site-health/Route";

export const Route = createFileRoute("/_app/v2/diagnostics/site-health")({
  component: Board18Route,
  staticData: { v2Shell: "expert", v2Board: "b18" },
});
