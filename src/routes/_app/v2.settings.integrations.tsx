import { createFileRoute } from "@tanstack/react-router";
import { Board25Route } from "@/v2/screens/b25-integrations/Route";

export const Route = createFileRoute("/_app/v2/settings/integrations")({
  component: Board25Route,
  staticData: { v2Shell: "guided", v2Board: "b25" },
});
