import { createFileRoute } from "@tanstack/react-router";
import Register from "@/pages/register";

// Eager import, matching client/src/App.tsx's eager-import list.
export const Route = createFileRoute("/_app/register")({
  head: () => ({
    meta: [{ title: "Create Account - VentureCite" }, { name: "robots", content: "noindex" }],
  }),
  component: Register,
});
