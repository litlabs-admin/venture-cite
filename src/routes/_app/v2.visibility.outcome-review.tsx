import { createFileRoute } from "@tanstack/react-router";
import { Board21Route } from "@/v2/screens/b21-outcome-review/Route";

export const Route = createFileRoute("/_app/v2/visibility/outcome-review")({
  component: Board21Route,
  staticData: { v2Shell: "guided", v2Board: "b21" },
});
