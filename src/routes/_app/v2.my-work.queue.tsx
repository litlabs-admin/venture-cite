import { createFileRoute } from "@tanstack/react-router";
import { Board39Route } from "@/v2/screens/b39-work-queue/Route";

export const Route = createFileRoute("/_app/v2/my-work/queue")({
  component: Board39Route,
  staticData: { v2Shell: "guided", v2Board: "b39" },
});
