import { Outlet, createFileRoute } from "@tanstack/react-router";

// `/v2/my-work`, and `/v2/my-work?task=<id>` for one task.
//
// The dotted filename resolves to the nested path, so the route id is
// "/_app/v2/my-work" - the parent (`v2.tsx`) already carries the gate and the
// search schema, and `task` is already declared there, so neither is repeated.
//
// The task lives in the search rather than in the path because it is a
// selection within this screen, not a different screen: the list and the open
// task share a rail, and the URL stays copyable either way.
export const Route = createFileRoute("/_app/v2/my-work")({
  component: Outlet,
  staticData: { v2Shell: "guided" },
});
