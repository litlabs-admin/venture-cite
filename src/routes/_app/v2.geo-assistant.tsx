import { createFileRoute } from "@tanstack/react-router";
import { Board22Route } from "@/v2/screens/b22-geo-assistant/Route";

export const Route = createFileRoute("/_app/v2/geo-assistant")({
  component: Board22Route,
  staticData: { v2Shell: "guided", v2Board: "b22" },
});
