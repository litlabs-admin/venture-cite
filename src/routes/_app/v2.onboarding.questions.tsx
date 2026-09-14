import { createFileRoute } from "@tanstack/react-router";
import { Board31Route } from "@/v2/screens/b31-onboarding-questions/Route";

export const Route = createFileRoute("/_app/v2/onboarding/questions")({
  component: Board31Route,
  staticData: { v2Shell: "bare", v2Board: "b31" },
});
