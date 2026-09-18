// Action card: pending / done / dismissed / failed / reversed. Wording
// matches Trakkr verbatim per the "replicate closely" instruction
// (04-implementation-plan.md §0): "Waiting on you", "Add to queue",
// "Dismiss", "Untrack"-style undo. Schema and field order from
// 01-trakkr-teardown.md R11's fully observed expanded card.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Target, FileText, RefreshCw, Brain, Loader2, Check, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AskActionCard as AskActionCardType, ActionKind } from "@shared/ask/actions";
import {
  ACTION_KIND_DONE_LABEL,
  ACTION_KIND_UNDO_LABEL,
  ACTION_KIND_APPROVE_LABEL,
} from "@shared/ask/actions";

// Per-kind leading icon. remember_fact reuses the same Brain glyph as the
// top bar's "What I know" control - same underlying concept, one visual
// vocabulary.
const ACTION_KIND_ICON: Record<ActionKind, typeof Target> = {
  track_prompt: Target,
  queue_article: FileText,
  run_citation_check: RefreshCw,
  remember_fact: Brain,
};

export function AskActionCard({ card }: { card: AskActionCardType }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/ask/threads"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ask/actions"] });
  };

  const approve = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/ask/actions/${card.id}/approve`),
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/ask/actions/${card.id}/dismiss`),
    onSuccess: invalidate,
  });
  const undo = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/ask/actions/${card.id}/undo`),
    onSuccess: invalidate,
  });

  const isPending = approve.isPending || dismiss.isPending || undo.isPending;
  const Icon = ACTION_KIND_ICON[card.kind] ?? Target;
  const doneLabel = ACTION_KIND_DONE_LABEL[card.kind] ?? "Done";
  const undoLabel = ACTION_KIND_UNDO_LABEL[card.kind] ?? "Undo";
  const approveLabel = ACTION_KIND_APPROVE_LABEL[card.kind] ?? "Add to queue";

  return (
    <div className="mb-3 rounded-md border border-vc-default bg-vc-surface animate-fade-in-up motion-reduce:animate-none">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Icon className="h-4 w-4 shrink-0 text-vc-tertiary" />
        <span className="text-caption font-medium text-vc-primary">{card.kindLabel}</span>
        <span
          className={cn(
            "ml-auto flex items-center gap-1 text-caption",
            card.status === "done" && "text-positive",
            card.status === "pending" && "text-vc-tertiary",
            card.status === "failed" && "text-destructive",
            card.status === "dismissed" && "text-vc-tertiary",
            card.status === "reversed" && "text-vc-tertiary",
          )}
        >
          {card.status === "done" && <Check className="h-3 w-3" />}
          {card.status === "pending"
            ? "Pending"
            : card.status[0].toUpperCase() + card.status.slice(1)}
        </span>
      </button>

      <div className="px-3 pb-3">
        <p className="text-caption text-vc-secondary">{card.title}</p>

        {expanded && (
          <div className="mt-2 space-y-2 border-t border-vc-default pt-2 text-caption">
            {card.inputEcho && <p className="text-vc-secondary">{card.inputEcho}</p>}
            {card.rationale && <p className="text-vc-tertiary">{card.rationale}</p>}
            {Object.keys(card.params).length > 0 && (
              <p className="italic text-vc-tertiary">
                {Object.entries(card.params)
                  .map(([k, v]) => `${k} '${v}'`)
                  .join(", ")}
              </p>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          {card.status === "pending" && (
            <>
              <Button
                size="sm"
                variant="default"
                disabled={isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  approve.mutate();
                }}
              >
                {approve.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {approveLabel}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss.mutate();
                }}
              >
                Dismiss
              </Button>
            </>
          )}
          {card.status === "done" && (
            <div className="flex w-full items-center justify-between">
              <span className="flex items-center gap-1 text-caption text-positive">
                <Check className="h-3 w-3" /> {doneLabel}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!card.isReversible || isPending}
                title={card.undoDisabledReason ?? undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  undo.mutate();
                }}
              >
                <Undo2 className="mr-1 h-3 w-3" />
                {undoLabel}
              </Button>
              {!card.isReversible && card.undoDisabledReason && (
                <span className="sr-only">{card.undoDisabledReason}</span>
              )}
            </div>
          )}
        </div>
        {card.status === "done" && !card.isReversible && card.undoDisabledReason && (
          <p className="mt-1 text-caption text-vc-tertiary">{card.undoDisabledReason}</p>
        )}
      </div>
    </div>
  );
}
