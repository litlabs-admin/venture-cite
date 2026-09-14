import { createFileRoute } from "@tanstack/react-router";
import TodayPage from "@/v2/today/TodayPage";

// `/v2/today`. The dotted filename resolves to the nested path, so the route
// id is "/_app/v2/today" - the parent (`v2.tsx`) already carries the gate and
// the search schema, and neither is repeated here.
export const Route = createFileRoute("/_app/v2/today")({
  component: TodayPage,
  staticData: { v2Shell: "guided", v2Board: "b01" },
});
