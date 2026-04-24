// Public privacy policy page (Wave 2.5).
//
// Source of truth is docs/privacy-policy.md — Vite's `?raw` query loads
// the markdown text at build time so the doc and the page can never drift.
// react-markdown renders it through SafeMarkdown so we don't accept any
// embedded HTML.

import policyMarkdown from "../../../docs/privacy-policy.md?raw";
import SafeMarkdown from "@/components/SafeMarkdown";
import { Helmet } from "react-helmet-async";

export default function Privacy() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy - VentureCite</title>
        <meta
          name="description"
          content="How VentureCite collects, uses, and protects your data."
        />
      </Helmet>
      <div className="container max-w-3xl py-12 prose prose-zinc dark:prose-invert">
        <SafeMarkdown>{policyMarkdown}</SafeMarkdown>
      </div>
    </>
  );
}
