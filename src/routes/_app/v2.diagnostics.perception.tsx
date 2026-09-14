import { createFileRoute } from "@tanstack/react-router";
import { Board13Route } from "@/v2/screens/b13-perception/Route";

export const Route = createFileRoute("/_app/v2/diagnostics/perception")({
  component: Board13Route,
  staticData: { v2Shell: "expert", v2Board: "b13" },
});
