import { createFileRoute } from "@tanstack/react-router";
import { Board43Route } from "@/v2/screens/b43-notifications/Route";

export const Route = createFileRoute("/_app/v2/notifications")({
  component: Board43Route,
  staticData: { v2Shell: "guided", v2Board: "b43" },
});
