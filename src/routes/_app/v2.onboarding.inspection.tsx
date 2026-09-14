import { createFileRoute } from "@tanstack/react-router";
import { Board29Route } from "@/v2/screens/b29-website-inspection/Route";

export const Route = createFileRoute("/_app/v2/onboarding/inspection")({
  component: Board29Route,
  staticData: { v2Shell: "bare", v2Board: "b29" },
});
