import { createFileRoute } from "@tanstack/react-router";
import { Board32Route } from "@/v2/screens/b32-baseline-creation/Route";

export const Route = createFileRoute("/_app/v2/onboarding/baseline")({
  component: Board32Route,
  staticData: { v2Shell: "bare", v2Board: "b32" },
});
