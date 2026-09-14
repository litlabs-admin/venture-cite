import { createFileRoute } from "@tanstack/react-router";
import { Board07Route } from "@/v2/screens/b07-brand-facts/Route";

// `/v2/brand-facts`: the Level 1 setup gate. `Board07Route` itself redirects
// on to the workspace (`/v2/brand-facts/workspace`) once essential facts are
// approved - see its own comment for why that selector lives there rather
// than here.
export const Route = createFileRoute("/_app/v2/brand-facts/")({
  component: Board07Route,
  staticData: { v2Shell: "guided", v2Board: "b07" },
});
