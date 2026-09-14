import { createFileRoute } from "@tanstack/react-router";
import { Board37Route } from "@/v2/screens/b37-citation-explorer/Route";

export const Route = createFileRoute("/_app/v2/visibility/citations")({
  component: Board37Route,
  staticData: { v2Shell: "guided", v2Board: "b37" },
});
