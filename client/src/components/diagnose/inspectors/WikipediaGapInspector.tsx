import type { WikipediaMention } from "@shared/schema";

// Accept the full wikipedia mention row from the server aggregator
// (server/lib/diagnoseIssues.ts puts it in `Issue.metadata.mention`).
// The legacy `/api/wikipedia/single/:id` endpoint never existed.
export default function WikipediaGapInspector({
  mention,
}: {
  mention: WikipediaMention & {
    // Tolerate older shape that used { title, summary } before we moved
    // to the canonical schema fields (pageTitle, mentionContext).
    title?: string | null;
    summary?: string | null;
  };
}) {
  if (!mention) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  const title = mention.title ?? mention.pageTitle;
  const summary = mention.summary ?? mention.mentionContext ?? null;

  return (
    <div className="p-4 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Wikipedia gap</p>
        <h2 className="text-lg font-semibold mt-1">{title}</h2>
      </header>
      <section className="space-y-2 text-sm">
        <p>{summary ?? "No summary."}</p>
      </section>
      <p className="text-sm text-muted-foreground italic">
        Open the existing Wikipedia draft helper from Coverage.tsx — if a `WikiDraftHelper`
        subcomponent exists there, this Inspector should mount it. Otherwise, ship as a thin
        &quot;Draft → POST /api/wikipedia/draft/:mentionId&quot; with the response rendered to a
        textarea.
      </p>
    </div>
  );
}
