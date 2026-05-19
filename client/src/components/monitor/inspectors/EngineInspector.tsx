// client/src/components/monitor/inspectors/EngineInspector.tsx
//
// Per-engine drill-down inspector. Flattened to a single stacked surface — no
// inner tabs (the consolidation's whole point). Weekly history lives on the
// canvas's trend chart, not in here.

import { useQuery } from "@tanstack/react-query";

export default function EngineInspector({
  brandId,
  engineName,
}: {
  brandId: string;
  engineName: string;
}) {
  const rankings = useQuery({
    queryKey: [`/api/dashboard/rankings/${brandId}`],
    enabled: !!brandId,
  });
  const platforms = (rankings.data as any)?.data?.platforms ?? [];
  const me = platforms.find((p: any) => p.aiPlatform === engineName);

  return (
    <div className="p-4 space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Engine</p>
        <h2 className="text-lg font-semibold mt-1">{engineName}</h2>
      </header>

      {/* Verbatim section — only renders when there's a real snippet */}
      {me?.latestSnippet && (
        <section className="space-y-2">
          <p className="text-sm font-medium">Latest cited response</p>
          <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-wrap text-muted-foreground">
            {me.latestSnippet}
          </blockquote>
          {me?.latestSnippetPrompt && (
            <p className="text-xs text-muted-foreground">
              In response to: {me.latestSnippetPrompt}
            </p>
          )}
        </section>
      )}

      {!me?.latestSnippet && (
        <p className="text-sm text-muted-foreground">No cited snippet yet for this engine.</p>
      )}

      {/* Per-prompt list */}
      <section className="space-y-2">
        <p className="text-sm font-medium">Prompts</p>
        <PerEnginePrompts brandId={brandId} engineName={engineName} />
      </section>
    </div>
  );
}

function PerEnginePrompts({ brandId, engineName }: { brandId: string; engineName: string }) {
  // NOTE: The `/api/geo-rankings` endpoint may not honor the `brandId`/`platform`
  // filters today (Important #7 in the review). If we get unfiltered data back,
  // we filter client-side by `aiPlatform === engineName` here as a safety net.
  const { data, isLoading } = useQuery({
    queryKey: [`/api/geo-rankings?brandId=${brandId}&platform=${engineName}`],
    enabled: !!brandId,
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const allRankings = ((data as any)?.data ?? []) as any[];
  const rankings = allRankings.filter((r) => r.aiPlatform === engineName);

  if (rankings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No prompt-level results yet for this engine.</p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {rankings.map((r: any) => (
        <li key={r.id} className="text-sm flex justify-between">
          <span className="truncate flex-1 pr-2">{r.promptText ?? r.brandPromptId}</span>
          <span className="tabular-nums text-muted-foreground">
            {r.isCited ? `rank ${r.rank ?? "—"}` : "not cited"}
          </span>
        </li>
      ))}
    </ul>
  );
}
