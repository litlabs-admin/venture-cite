import { createFileRoute } from "@tanstack/react-router";
import Privacy from "@/pages/privacy";

// Server-rendered public privacy policy page. Title/description are
// route-level `head()` now (verbatim from what client/src/pages/privacy.tsx
// used to render itself via a raw <title>/<meta> pair) - the component no
// longer sets any metadata of its own.
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy - VentureCite" },
      { name: "description", content: "How VentureCite collects, uses, and protects your data." },
    ],
  }),
  component: Privacy,
});
