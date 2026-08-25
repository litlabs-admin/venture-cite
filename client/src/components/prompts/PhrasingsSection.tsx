import { useState } from "react";
import { Loader2, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PanelLabel } from "@/components/dashboard-panels/primitives";
import { usePhrasings, useGeneratePhrasings, useAnalyzePhrasing } from "@/hooks/usePrompts";

// Exploratory only - a phrasing's results never touch geo_rankings, so they
// never affect the tracked prompt's own Score/Δ/sparkline (see
// migrations/0099's comment).
export function PhrasingsSection({
  selectedBrandId,
  promptId,
}: {
  selectedBrandId: string;
  promptId: string;
}) {
  const { toast } = useToast();
  const { data, isLoading } = usePhrasings(selectedBrandId, promptId);
  const generate = useGeneratePhrasings(selectedBrandId, promptId);
  const analyze = useAnalyzePhrasing(selectedBrandId, promptId);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const phrasings = data?.data ?? [];

  function onGenerate() {
    generate.mutate(undefined, {
      onSuccess: ({ body }: any) => {
        if (!body.success) {
          toast({
            title: "Couldn't generate phrasings",
            description: body.error,
            variant: "destructive",
          });
        }
      },
    });
  }

  function onAnalyze(id: string) {
    setAnalyzingId(id);
    analyze.mutate(id, {
      onSuccess: ({ body }: any) => {
        if (!body.success) {
          toast({
            title: "Couldn't analyze phrasing",
            description: body.error,
            variant: "destructive",
          });
        }
      },
      onSettled: () => setAnalyzingId(null),
    });
  }

  return (
    <div className="border-b border-vc-default px-8 py-6">
      <div className="flex items-center justify-between">
        <PanelLabel>Phrasings</PanelLabel>
        {phrasings.length > 0 && (
          <Button size="sm" variant="outline" onClick={onGenerate} disabled={generate.isPending}>
            {generate.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate more
          </Button>
        )}
      </div>
      <p className="mt-2 max-w-prose text-body text-vc-secondary">
        See how visibility shifts when this question is phrased differently.
      </p>

      {isLoading ? (
        <div className="mt-3 h-16 animate-pulse rounded bg-vc-muted/40" />
      ) : phrasings.length === 0 ? (
        <Button size="sm" className="mt-3" onClick={onGenerate} disabled={generate.isPending}>
          {generate.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          Generate phrasings
        </Button>
      ) : (
        <div className="mt-3 space-y-3">
          {phrasings.map((p) => (
            <div key={p.id} className="rounded border border-vc-default p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-caption font-medium text-vc-primary">{p.phrasing}</p>
                  {p.rationale && (
                    <p className="mt-0.5 text-data text-vc-tertiary">{p.rationale}</p>
                  )}
                </div>
                {!p.results && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => onAnalyze(p.id)}
                    disabled={analyzingId === p.id}
                  >
                    {analyzingId === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Test"
                    )}
                  </Button>
                )}
              </div>
              {p.results && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {p.results.map((r) => (
                    <span
                      key={r.platform}
                      className="flex items-center gap-1 text-data text-vc-tertiary"
                    >
                      {r.isCited ? (
                        <CheckCircle2 className="h-3 w-3 text-positive" />
                      ) : (
                        <XCircle className="h-3 w-3 text-vc-hover" />
                      )}
                      {r.platform}
                      {r.isCited && r.rank ? ` #${r.rank}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
