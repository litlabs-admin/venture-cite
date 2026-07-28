import { createFileRoute } from "@tanstack/react-router";
import ForgotPassword from "@/pages/forgot-password";

// Eager import, matching client/src/App.tsx's eager-import list.
export const Route = createFileRoute("/_app/forgot-password")({
  // Title text is verbatim from what client/src/pages/forgot-password.tsx
  // used to render itself ("Reset Password", not "Forgot Password" — not
  // this task's call to reword).
  head: () => ({
    meta: [{ title: "Reset Password - VentureCite" }, { name: "robots", content: "noindex" }],
  }),
  component: ForgotPassword,
});
