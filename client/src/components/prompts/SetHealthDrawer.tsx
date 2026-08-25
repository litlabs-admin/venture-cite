import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSetHealth, useRunSetHealth, useArchivePrompt } from "@/hooks/usePrompts";
import type { BrandPrompt } from "@shared/schema";

// One shared shell, same structural precedent as
// client/src/components/site-health/FindingDrawer.tsx (a Sheet, opened from
// a header button, "Apply"-style actions wired to real mutations rather
// than navigation-only stubs).
export function SetHealthDrawer({
  open,
  onOpenChange,
  selectedBrandId,
  prompts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedBrandId: string;
  prompts: BrandPrompt[];
}) {
  const { toast } = useToast();
  const { data, isLoading } = useSetHealth(selectedBrandId);
  const run = useRunSetHealth(selectedBrandId);
  const archivePrompt = useArchivePrompt(selectedBrandId);
  const [showDetails, setShowDetails] = useState(false);

  const health = data?.data ?? null;
  const promptById = new Map(prompts.map((p) => [p.id, p]));

  function onRun() {
    run.mutate(undefined, {
      onSuccess: ({ body }: any) => {
        if (!body.success) {
          toast({
            title: "Couldn't run audit",
            description: body.error,
            variant: "destructive",
          });
        }
      },
    });
  }

  const duplicateIds = health?.topFix?.duplicatePromptIds ?? [];
  // Trim to the second prompt of each detected pair - never both, or the
  // "fix" would archive every prompt in the set.
  const trimCandidates = duplicateIds.filter((_, i) => i % 2 === 1);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Prompt Set Health</SheetTitle>
          <SheetDescription>
            An audit of how well your tracked prompts cover the buying journey.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {isLoading ? (
            <div className="h-24 animate-pulse rounded bg-vc-muted/40" />
          ) : !health ? (
            <div className="flex flex-col items-center py-10 text-center">
              <p className="mb-4 text-caption text-vc-tertiary">No audit has run yet.</p>
              <Button size="sm" onClick={onRun} disabled={run.isPending}>
                {run.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Run audit
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-vc-accent/20 font-mono text-title font-semibold tabular-nums text-vc-primary">
                  {health.score ?? "–"}
                </div>
                <p className="text-caption text-vc-secondary">
                  {health.verdict ?? "Not enough evidence to score this set yet."}
                </p>
              </div>

              {health.topFix && (
                <div className="rounded border border-vc-accent/20 bg-vc-accent-subtle/30 p-4">
                  <p className="mb-1 text-data font-semibold uppercase tracking-wide text-vc-accent">
                    Top fix
                  </p>
                  <p className="mb-1 text-caption font-medium text-vc-primary">
                    {health.topFix.title}
                  </p>
                  <p className="mb-3 text-data text-vc-tertiary">{health.topFix.description}</p>
                  {trimCandidates.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {trimCandidates.map((id) => {
                        const p = promptById.get(id);
                        if (!p) return null;
                        return (
                          <Button
                            key={id}
                            size="sm"
                            variant="outline"
                            disabled={archivePrompt.isPending}
                            onClick={() =>
                              archivePrompt.mutate(id, {
                                onSuccess: () => toast({ title: "Prompt archived" }),
                              })
                            }
                          >
                            Trim "{p.prompt.slice(0, 30)}
                            {p.prompt.length > 30 ? "…" : ""}"
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="text-caption font-medium text-vc-accent hover:underline"
                >
                  {showDetails ? "Hide" : "Show"} details
                </button>
                {showDetails && (
                  <div className="mt-3 space-y-4">
                    {health.issues.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-data font-semibold uppercase tracking-wide text-vc-tertiary">
                          Issues
                        </p>
                        <ul className="space-y-1">
                          {health.issues.map((issue, i) => (
                            <li key={i} className="text-caption text-vc-secondary">
                              • {issue}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {health.workingWell.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-data font-semibold uppercase tracking-wide text-vc-tertiary">
                          Working well
                        </p>
                        <ul className="space-y-1">
                          {health.workingWell.map((item, i) => (
                            <li key={i} className="text-caption text-vc-secondary">
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Button size="sm" variant="outline" onClick={onRun} disabled={run.isPending}>
                {run.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Re-run audit
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
