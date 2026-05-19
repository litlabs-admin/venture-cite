import { useQuery } from "@tanstack/react-query";

export default function WikipediaGapInspector({ mentionId }: { mentionId: string }) {
  const { data } = useQuery({
    queryKey: [`/api/wikipedia/single/${mentionId}`],
    enabled: !!mentionId,
  });
  const mention = (data as any)?.data;
  if (!mention) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="p-4 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Wikipedia gap</p>
        <h2 className="text-lg font-semibold mt-1">{mention.title}</h2>
      </header>
      <section className="space-y-2 text-sm">
        <p>{mention.summary ?? "No summary."}</p>
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
