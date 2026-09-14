import { createFileRoute } from "@tanstack/react-router";
import { Board42Route } from "@/v2/screens/b42-team-handoff/Route";

export const Route = createFileRoute("/_app/v2/settings/team")({
  component: Board42Route,
  staticData: { v2Shell: "guided", v2Board: "b42" },
});
