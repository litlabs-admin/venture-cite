import { createFileRoute } from "@tanstack/react-router";
import { Board23Route } from "@/v2/screens/b23-agency-dashboard/Route";

export const Route = createFileRoute("/_app/v2/agency")({
  component: Board23Route,
  staticData: { v2Shell: "agency", v2Board: "b23" },
});
