import { createFileRoute } from "@tanstack/react-router";
import { Board27Route } from "@/v2/screens/b27-plan-selection/Route";

export const Route = createFileRoute("/_app/v2/plans")({
  component: Board27Route,
  staticData: { v2Shell: "bare", v2Board: "b27" },
});
