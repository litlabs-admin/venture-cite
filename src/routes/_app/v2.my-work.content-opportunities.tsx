import { createFileRoute } from "@tanstack/react-router";
import { Board41Route } from "@/v2/screens/b41-content-opportunities/Route";

export const Route = createFileRoute("/_app/v2/my-work/content-opportunities")({
  component: Board41Route,
  staticData: { v2Shell: "guided", v2Board: "b41" },
});
