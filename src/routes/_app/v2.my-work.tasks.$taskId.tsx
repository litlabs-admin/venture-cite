import { createFileRoute } from "@tanstack/react-router";
import { Board19Route } from "@/v2/screens/b19-content-task/Route";

export const Route = createFileRoute("/_app/v2/my-work/tasks/$taskId")({
  component: Board19Route,
  staticData: { v2Shell: "guided", v2Board: "b19" },
});
