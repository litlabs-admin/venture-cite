import { createFileRoute } from "@tanstack/react-router";
import { Board08Route } from "@/v2/screens/b08-visibility-overview/Route";

// `/v2/visibility` - the overview.
export const Route = createFileRoute("/_app/v2/visibility/")({
  component: Board08Route,
  staticData: { v2Shell: "expert", v2Board: "b08" },
});
