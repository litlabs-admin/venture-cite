import { createFileRoute } from "@tanstack/react-router";
import { Board10Route } from "@/v2/screens/b10-results-review/Route";

// `/v2/visibility/results` - the results review, where a decision is recorded
// against the period the evidence covers.
export const Route = createFileRoute("/_app/v2/visibility/results")({
  component: Board10Route,
  staticData: { v2Shell: "guided", v2Board: "b10" },
});
