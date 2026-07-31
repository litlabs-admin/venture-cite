import { createFileRoute } from "@tanstack/react-router";
import GlossaryPage from "@/pages/glossary";

// Server-rendered public glossary page. Title/description are route-level
// `head()` now (verbatim from client/src/pages/glossary.tsx's former
// TITLE/META_DESCRIPTION constants, which drove a raw <title>/<meta> pair)
// - the component no longer sets any metadata of its own. Its page-specific
// JSON-LD <script> stays in the component body: that's not a <title>/<meta>
// tag, React 19 doesn't hoist a plain <script>, and it's out of this task's
// "duplicate title/meta" scope.
export const Route = createFileRoute("/glossary")({
  head: () => ({
    meta: [
      { title: "GEO vs AEO vs SEO - VentureCite Glossary" },
      {
        name: "description",
        content:
          "Plain-English definitions of GEO (Generative Engine Optimization), AEO (Answer Engine Optimization), and SEO (Search Engine Optimization), and how they layer.",
      },
    ],
  }),
  component: GlossaryPage,
});
