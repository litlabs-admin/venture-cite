import { createFileRoute } from "@tanstack/react-router";
import VerifyEmail from "@/pages/verify-email";

// Eager import, matching client/src/App.tsx's eager-import list.
export const Route = createFileRoute("/_app/verify-email")({
  head: () => ({
    meta: [{ title: "Verify your email - VentureCite" }, { name: "robots", content: "noindex" }],
  }),
  component: VerifyEmail,
});
