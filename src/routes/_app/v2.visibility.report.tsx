import { createFileRoute } from "@tanstack/react-router";
import { Board20Route } from "@/v2/screens/b20-report/Route";

export const Route = createFileRoute("/_app/v2/visibility/report")({
  component: Board20Route,
  staticData: { v2Shell: "guided", v2Board: "b20" },
});
