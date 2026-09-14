import { createFileRoute } from "@tanstack/react-router";
import { Board03Route } from "@/v2/screens/b03-task-list/Route";

export const Route = createFileRoute("/_app/v2/my-work/")({
  component: Board03Route,
  staticData: { v2Shell: "guided", v2Board: "b03" },
});
