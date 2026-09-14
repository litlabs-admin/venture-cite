import { createFileRoute } from "@tanstack/react-router";
import { Board44Route } from "@/v2/screens/b44-billing/Route";

export const Route = createFileRoute("/_app/v2/settings/billing")({
  component: Board44Route,
  staticData: { v2Shell: "guided", v2Board: "b44" },
});
