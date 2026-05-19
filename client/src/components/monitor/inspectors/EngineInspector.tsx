// client/src/components/monitor/inspectors/EngineInspector.tsx
//
// Replaces the per-engine drill-down that previously required tab-switching:
// verbatim responses, prompt-by-prompt, per-engine history.

import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
    <div className="p-4 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Engine</p>
        <h2 className="text-lg font-semibold mt-1">{engineName}</h2>
      </header>

      <Tabs defaultValue="verbatim">
        <TabsList>
          <TabsTrigger value="verbatim">Verbatim</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="verbatim" className="space-y-2 mt-3">
          {me?.latestSnippet ? (
            <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-wrap">
              {me.latestSnippet}
            </blockquote>
          ) : (
            <p className="text-sm text-muted-foreground">No cited snippet yet.</p>
          )}
          {me?.latestSnippetPrompt && (
            <p className="text-xs text-muted-foreground">
              In response to: {me.latestSnippetPrompt}
            </p>
          )}
        </TabsContent>
        <TabsContent value="prompts" className="mt-3">
          <PerEnginePrompts brandId={brandId} engineName={engineName} />
        </TabsContent>
        <TabsContent value="history" className="mt-3">
          <p className="text-sm text-muted-foreground">Per-engine history coming soon.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PerEnginePrompts({ brandId, engineName }: { brandId: string; engineName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: [`/api/geo-rankings?brandId=${brandId}&platform=${engineName}`],
    enabled: !!brandId,
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const rankings = (data as any)?.data ?? [];
  return (
    <ul className="space-y-2">
      {rankings.map((r: any) => (
        <li key={r.id} className="text-sm flex justify-between">
          <span className="truncate">{r.promptText ?? r.brandPromptId}</span>
          <span className="tabular-nums text-muted-foreground">
            {r.isCited ? `rank ${r.rank ?? "—"}` : "not cited"}
          </span>
        </li>
      ))}
    </ul>
  );
}
