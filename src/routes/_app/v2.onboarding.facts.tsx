import { createFileRoute } from "@tanstack/react-router";
import { Board30Route } from "@/v2/screens/b30-onboarding-facts/Route";

export const Route = createFileRoute("/_app/v2/onboarding/facts")({
  component: Board30Route,
  staticData: { v2Shell: "bare", v2Board: "b30" },
});
