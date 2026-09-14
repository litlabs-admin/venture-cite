import { createFileRoute } from "@tanstack/react-router";
import { Board40Route } from "@/v2/screens/b40-earned-media/Route";

export const Route = createFileRoute("/_app/v2/my-work/earned-media")({
  component: Board40Route,
  staticData: { v2Shell: "expert", v2Board: "b40" },
});
