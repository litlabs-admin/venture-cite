import { createFileRoute } from "@tanstack/react-router";
import VisibilityPage from "@/v2/visibility/VisibilityPage";

// `/v2/visibility` - the overview.
export const Route = createFileRoute("/_app/v2/visibility/")({
  component: VisibilityPage,
});
