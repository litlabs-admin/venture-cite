import { createFileRoute } from "@tanstack/react-router";
import { Board28Route } from "@/v2/screens/b28-onboarding-start/Route";

export const Route = createFileRoute("/_app/v2/onboarding/start")({
  component: Board28Route,
  staticData: { v2Shell: "bare", v2Board: "b28" },
});
