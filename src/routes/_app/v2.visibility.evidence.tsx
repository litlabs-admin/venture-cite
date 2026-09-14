import { createFileRoute } from "@tanstack/react-router";
import EvidencePage from "@/v2/visibility/EvidencePage";

// `/v2/visibility/evidence` - the answer and source evidence behind the rate.
export const Route = createFileRoute("/_app/v2/visibility/evidence")({
  component: EvidencePage,
  staticData: { v2Shell: "expert", v2Board: "b09" },
});
