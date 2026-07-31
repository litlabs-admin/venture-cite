// Consolidated cross-run, cross-platform history for a single tracked
// prompt. Replaces what used to be split between ResultsTab's
// latest-run-only accordion and HistoryTab's per-run drill-down - this is
// the one place to see everything that ever happened for a prompt. Rendered
// inside AppShell's inspector (see useInspector in AppShell.tsx), opened
// from a prompt row in PromptsTab.tsx / ResultsTab.tsx / HistoryTab.tsx.

import { useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { Loader2, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/foundations";
import { usePromptHistory, usePromptRunDetails } from "@/hooks/usePrompts";
import { PlatformResultCard, type PlatformResult } from "./PlatformResultCard";

type PromptDetailProps = {
  // Currently informational only (kept for callers that have it and for a
  // future promptId-based join if the server ever groups run details by
  // id) - matching against a run's byPrompt rows happens via `promptText`
  // since that's the only stable key the /run/:runId/details endpoint
  // exposes. See the comment on `promptText` below.
  promptId?: string;
  // The server's per-run /details endpoint groups results by prompt TEXT,
  // not promptId (a run can outlive the prompt row it was checked against -
  // prompts get edited/archived - so there's no stable id to join on
  // historically). Callers that already have the BrandPrompt row pass its
  // current text so we can look up its slice of each run; without it we
  // fall back to "current run only" via `usePromptResults`, which the
  // /results endpoint DOES key by promptId.
  promptText?: string;
  brandId: string | null | undefined;
};

export default function PromptDetail({ promptId, promptText, brandId }: PromptDetailProps) {
  const { data: historyData, isLoading: historyLoading } = usePromptHistory(brandId);
  const runs = (historyData?.data || []).filter((r) => (r.status ?? "succeeded") === "succeeded");

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const activeRunId = selectedRunId ?? runs[0]?.id ?? null;

  const { data: runDetailData, isLoading: runDetailLoading } = usePromptRunDetails(
    brandId,
    activeRunId,
    { enabled: !!activeRunId },
  );

  // Match this run's byPrompt rows (grouped by text - see the type comment
  // above) against the prompt's current text. If we don't know the text
  // (caller didn't pass it), fall back to whatever single row exists when
  // the run only has one prompt - better than showing nothing - otherwise
  // show the "no match" empty state rather than guessing wrong.
  const promptRowForRun = useMemo(() => {
    const rows = runDetailData?.data?.byPrompt;
    if (!rows || rows.length === 0) return null;
    if (promptText) return rows.find((row) => row.prompt === promptText) ?? null;
    return rows.length === 1 ? rows[0] : null;
  }, [runDetailData, promptText]);
  void promptId;

  if (historyLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="text-caption text-muted-foreground text-center py-8">
        No completed runs yet. Run a citation check to start building history for this prompt.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-label uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Runs
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {runs.slice(0, 20).map((run) => {
            const isActive = run.id === activeRunId;
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedRunId(run.id)}
                className={`text-caption px-2 py-1 rounded border transition-colors ${
                  isActive
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
                data-testid={`prompt-detail-run-${run.id}`}
              >
                {format(new Date(run.startedAt), "MMM d")}
                <span className="ml-1 tabular-nums">{run.citationRate}%</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        {runDetailLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !promptRowForRun || promptRowForRun.platforms.length === 0 ? (
          <p className="text-caption text-muted-foreground text-center py-4">
            No platform results captured for this prompt in the selected run.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusDot tone="success" aria-label="Run summary" />
              <span className="text-caption text-muted-foreground">
                {activeRunId &&
                  runs.find((r) => r.id === activeRunId) &&
                  formatDistanceToNow(new Date(runs.find((r) => r.id === activeRunId)!.startedAt), {
                    addSuffix: true,
                  })}
              </span>
              <Badge variant="outline" className="text-caption ml-auto">
                {promptRowForRun.platforms.filter((p) => p.isCited).length}/
                {promptRowForRun.platforms.length} cited
              </Badge>
            </div>
            {promptRowForRun.platforms.map((plat: PlatformResult, i: number) => (
              <PlatformResultCard key={`${plat.platform}-${i}`} result={plat} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
