import { createFileRoute } from "@tanstack/react-router";
import LearnPage from "@/v2/learn/LearnPage";

// `/v2/learn`.
//
// The dotted filename resolves to the nested path, so the route id is
// "/_app/v2/learn" - the parent (`v2.tsx`) already carries the gate and the
// search schema, and neither is repeated here.
//
// The screen behind this route is a navigable frame with no lesson content.
// The route exists anyway, because the alternative is a nav row that cannot
// be visited, and the shape of the area is what is under review.
export const Route = createFileRoute("/_app/v2/learn")({
  component: LearnPage,
});
