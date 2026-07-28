import { createFileRoute } from "@tanstack/react-router";
import ResetPassword from "@/pages/reset-password";

// Eager import, matching client/src/App.tsx's eager-import list.
export const Route = createFileRoute("/_app/reset-password")({
  head: () => ({
    meta: [{ title: "Set New Password - VentureCite" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPassword,
});
