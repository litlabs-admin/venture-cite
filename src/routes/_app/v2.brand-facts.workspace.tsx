import { createFileRoute } from "@tanstack/react-router";
import { Board34Route } from "@/v2/screens/b34-facts-workspace/Route";

export const Route = createFileRoute("/_app/v2/brand-facts/workspace")({
  component: Board34Route,
  staticData: { v2Shell: "guided", v2Board: "b34" },
});
