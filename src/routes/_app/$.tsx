import { createFileRoute } from "@tanstack/react-router";
import NotFound from "@/pages/not-found";

// Catch-all 404. Eager import, matching client/src/App.tsx's eager-import
// list and its final `<Route component={NotFound} />` (lowest priority,
// matches any path nothing else claimed). Nested under the pathless _app
// layout it is a splat with no path prefix, so it matches the same URL
// space the old app-wide catch-all did.
export const Route = createFileRoute("/_app/$")({
  head: () => ({
    meta: [{ title: "Page Not Found - VentureCite" }, { name: "robots", content: "noindex" }],
  }),
  component: NotFound,
});
