import { createFileRoute } from "@tanstack/react-router";
import { Board33Route } from "@/v2/screens/b33-baseline-review/Route";

export const Route = createFileRoute("/_app/v2/onboarding/baseline-review")({
  component: Board33Route,
  staticData: { v2Shell: "guided", v2Board: "b33" },
});
