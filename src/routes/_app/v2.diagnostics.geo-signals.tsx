import { createFileRoute } from "@tanstack/react-router";
import { Board12Route } from "@/v2/screens/b12-geo-signals/Route";

export const Route = createFileRoute("/_app/v2/diagnostics/geo-signals")({
  component: Board12Route,
  staticData: { v2Shell: "expert-nav", v2Board: "b12" },
});
