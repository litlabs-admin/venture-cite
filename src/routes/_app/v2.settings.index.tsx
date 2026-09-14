import { createFileRoute } from "@tanstack/react-router";
import { Board24Route } from "@/v2/screens/b24-settings/Route";

export const Route = createFileRoute("/_app/v2/settings/")({
  component: Board24Route,
  staticData: { v2Shell: "guided", v2Board: "b24" },
});
