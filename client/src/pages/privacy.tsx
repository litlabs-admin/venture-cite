// Public privacy policy page (Wave 2.5).
//
// Source of truth is docs/privacy-policy.md — Vite's `?raw` query loads
// the markdown text at build time so the doc and the page can never drift.
// react-markdown renders it through SafeMarkdown so we don't accept any
// embedded HTML.

import policyMarkdown from "../../../docs/privacy-policy.md?raw";
import SafeMarkdown from "@/components/SafeMarkdown";

export default function Privacy() {
  return (
    // Title/description moved to src/routes/privacy.tsx's `head()` —
    // metadata belongs to the route, not this component.
    <div className="container max-w-3xl py-12 prose prose-zinc dark:prose-invert">
      <SafeMarkdown>{policyMarkdown}</SafeMarkdown>
    </div>
  );
}
