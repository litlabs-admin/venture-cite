// client/src/components/monitor/inspectors/PromptInspector.tsx
//
// Drill-down for a single tracked prompt. Read-only of last-run results;
// edit/delete via existing endpoints.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type BrandPromptLite = { id: string; prompt: string };

export default function PromptInspector({
  prompt,
  brandId,
}: {
  prompt: BrandPromptLite;
  brandId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rankingsData } = useQuery({
    queryKey: [`/api/geo-rankings?promptId=${prompt.id}`],
    enabled: !!prompt.id,
  });
  const rankings = (rankingsData as any)?.data ?? [];

  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/brand-prompts/${prompt.id}`),
    onSuccess: () => {
      toast({ title: "Prompt removed" });
      queryClient.invalidateQueries({ queryKey: [`/api/brand-prompts/${brandId}`] });
    },
  });

  return (
    <div className="p-4 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Tracked prompt</p>
        <h2 className="text-base font-medium mt-1">{prompt.prompt}</h2>
      </header>

      <section>
        <p className="text-sm font-medium mb-2">Latest results</p>
        {rankings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results yet — run a citation check.</p>
        ) : (
          <ul className="space-y-1.5">
            {rankings.map((r: any) => (
              <li key={r.id} className="flex justify-between text-sm">
                <span>{r.aiPlatform}</span>
                <span className="tabular-nums text-muted-foreground">
                  {r.isCited ? `rank ${r.rank ?? "—"}` : "not cited"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="pt-2">
        <Button variant="outline" size="sm" onClick={() => del.mutate()} disabled={del.isPending}>
          Remove prompt
        </Button>
      </footer>
    </div>
  );
}
