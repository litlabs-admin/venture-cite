import { createFileRoute } from "@tanstack/react-router";
import Login from "@/pages/login";

// Eager import, matching client/src/App.tsx's "first-paint + auth flow"
// eager-import list. No auth gate — this page IS the auth flow.
export const Route = createFileRoute("/_app/login")({
  // `robots: noindex` must survive as a route-level override — this page
  // must never be indexed even though the root default is `index, follow`.
  head: () => ({
    meta: [{ title: "Sign In - VentureCite" }, { name: "robots", content: "noindex" }],
  }),
  component: Login,
});
