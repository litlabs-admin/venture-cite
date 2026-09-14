import { createFileRoute } from "@tanstack/react-router";
import { Board09Route } from "@/v2/screens/b09-visibility-evidence/Route";

// `/v2/visibility/evidence` - the answer and source evidence behind the rate.
export const Route = createFileRoute("/_app/v2/visibility/evidence")({
  component: Board09Route,
  staticData: { v2Shell: "expert", v2Board: "b09" },
});
