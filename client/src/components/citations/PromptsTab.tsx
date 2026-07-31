import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLoadingMessages } from "@/hooks/use-loading-messages";
import type { Brand, BrandPrompt } from "@shared/schema";
import { PromptsTable, type PromptRowModel } from "@/components/citations/PromptsTable";
import {
  usePromptSuggestions,
  useAllPrompts,
  usePromptResults,
  usePromptScoreHistory,
  useGeneratePrompts,
  useResetPrompts,
  useRefreshSuggestions,
  useAcceptSuggestion,
  useDismissSuggestion,
  useEditPrompt,
  useArchivePrompt,
  useCreatePrompt,
  useSetPromptStatus,
  useReorderPrompts,
} from "@/hooks/usePrompts";

// ─── Prompts tab ─────────────────────────────────────────────────────────────
// Table-first, ported from the reference Prompts view. This component owns the
// data plumbing, dialogs and toasts; PromptsTable owns presentation.
//
// The tracked cap is enforced server-side on every write path; the UI mirrors
// it so affordances disable before a request would be refused.

const TRACKED_CAP = 10;
const PROMPT_MAX_LEN = 500;

type MutationBody = { success: boolean; error?: string; data?: unknown };

type PromptsTabProps = {
  selectedBrandId: string;
  selectedBrand: Brand | undefined;
  prompts: BrandPrompt[];
  promptsLoading: boolean;
  hasPrompts: boolean;
  promptsAgeLabel: string | null;
};

export default function PromptsTab({
  selectedBrandId,
  selectedBrand,
  prompts,
  promptsLoading,
  hasPrompts,
  promptsAgeLabel,
}: PromptsTabProps) {
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: suggestionsData } = usePromptSuggestions(selectedBrandId);
  const suggestions = suggestionsData?.data ?? [];
  // The table renders archived rows too, greyed with their toggle off - the
  // `prompts` prop from the page is tracked-only, which would make a row
  // switched off disappear with no way to switch it back on.
  const { data: allPromptsData } = useAllPrompts(selectedBrandId);
  const tablePrompts = allPromptsData?.data ?? prompts;
  const { data: historyData, isLoading: historyLoading } = usePromptScoreHistory(selectedBrandId);
  const { data: resultsData } = usePromptResults(selectedBrandId);

  const generate = useGeneratePrompts(selectedBrandId);
  const reset = useResetPrompts(selectedBrandId);
  const refreshSuggestions = useRefreshSuggestions(selectedBrandId);
  const acceptSuggestion = useAcceptSuggestion(selectedBrandId);
  const dismissSuggestion = useDismissSuggestion(selectedBrandId);
  const editPrompt = useEditPrompt(selectedBrandId);
  const archivePrompt = useArchivePrompt(selectedBrandId);
  const createPrompt = useCreatePrompt(selectedBrandId);
  const setPromptStatus = useSetPromptStatus(selectedBrandId);
  const reorder = useReorderPrompts(selectedBrandId);

  const [archiving, setArchiving] = useState<BrandPrompt | null>(null);
  // Duplicating opens the text prefilled rather than creating a copy straight
  // away: the server rejects exact duplicates (they would double the run cost
  // and split one prompt's results across two rows), so the point of the
  // action is to seed a variation.
  const [duplicating, setDuplicating] = useState<BrandPrompt | null>(null);
  const [duplicateText, setDuplicateText] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [accepting, setAccepting] = useState<BrandPrompt | null>(null);
  const [acceptReplaceId, setAcceptReplaceId] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmed, setResetConfirmed] = useState(false);

  const generateMessage = useLoadingMessages(generate.isPending, [
    "Analyzing your brand...",
    "Reviewing published articles...",
    "Crafting strategic citation prompts...",
    "Scoring each prompt for AI visibility...",
    "Finalizing your portfolio...",
  ]);

  const historyById = useMemo(
    () => new Map((historyData?.data ?? []).map((h) => [h.promptId, h])),
    [historyData],
  );

  // "Blind spot" = the latest run cited nobody on this prompt. Read from the
  // results payload (deduped to the newest row per prompt+platform) rather
  // than from the score series, so a prompt that has simply never run is not
  // flagged as invisible.
  const blindSpotIds = useMemo(() => {
    const out = new Set<string>();
    for (const row of resultsData?.data?.byPrompt ?? []) {
      if (row.platforms.length > 0 && row.platforms.every((p) => !p.isCited)) out.add(row.promptId);
    }
    return out;
  }, [resultsData]);

  const rows: PromptRowModel[] = useMemo(
    () =>
      tablePrompts.map((p) => ({
        prompt: p,
        history: historyById.get(p.id),
        blindSpot: blindSpotIds.has(p.id),
      })),
    [tablePrompts, historyById, blindSpotIds],
  );

  const notify = (d: MutationBody, okTitle: string, failTitle: string) =>
    toast(
      d.success
        ? { title: okTitle }
        : { title: failTitle, description: d.error, variant: "destructive" },
    );

  // Opening a prompt is a navigation, not a side panel - the detail view has
  // its own page (see client/src/pages/prompt-detail.tsx), matching the
  // reference. The inspector is left for surfaces that genuinely drill down
  // without leaving the list.
  function openDetail(p: BrandPrompt) {
    void navigate({ to: "/prompts/$promptId", params: { promptId: p.id } });
  }

  function create(text: string) {
    createPrompt.mutate(text, {
      onSuccess: ({ body }) => {
        if (body.success) toast({ title: "Prompt added" });
        else if (body.error === "tracked_set_full")
          toast({
            title: "Tracked set is full",
            description: `Switch one off to free a slot (cap ${TRACKED_CAP}).`,
            variant: "destructive",
          });
        else if (body.error === "duplicate_prompt")
          toast({ title: "Already tracked", description: "That prompt is already in the list." });
        else
          toast({ title: "Couldn't add prompt", description: body.error, variant: "destructive" });
      },
      onError: (e: Error) =>
        toast({ title: "Couldn't add prompt", description: e.message, variant: "destructive" }),
    });
  }

  function createMany(texts: string[]) {
    const room = TRACKED_CAP - prompts.length;
    const accepted = texts.slice(0, Math.max(0, room));
    if (accepted.length === 0) {
      toast({
        title: "No room",
        description: `You're at the cap of ${TRACKED_CAP} prompts.`,
        variant: "destructive",
      });
      return;
    }
    // Sequential, not parallel: the cap and duplicate checks are evaluated per
    // request, so firing them concurrently would let more through than there
    // are slots.
    void accepted
      .reduce<Promise<void>>(
        (chain, text) =>
          chain.then(
            () =>
              new Promise<void>((resolve) => {
                createPrompt.mutate(text, { onSettled: () => resolve() });
              }),
          ),
        Promise.resolve(),
      )
      .then(() => {
        const skipped = texts.length - accepted.length;
        toast({
          title: `Added ${accepted.length} prompt${accepted.length === 1 ? "" : "s"}`,
          description: skipped > 0 ? `${skipped} skipped - tracked set is full.` : undefined,
        });
      });
  }

  function exportCsv() {
    const header = ["Prompt", "Score", "Change", "Runs", "Status", "Added", "Blind spot"];
    const body = rows.map((r) => [
      r.prompt.prompt,
      r.history?.score ?? "",
      r.history?.delta ?? "",
      r.history?.runs ?? 0,
      r.prompt.status,
      r.prompt.createdAt ? new Date(r.prompt.createdAt).toISOString().slice(0, 10) : "",
      r.blindSpot ? "yes" : "no",
    ]);
    const csv = [header, ...body]
      .map((line) =>
        line
          .map((v) => {
            const s = String(v ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `prompts-${(selectedBrand?.name ?? "brand").replace(/\W+/g, "-").toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!hasPrompts && !promptsLoading) {
    return (
      <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
        <Sparkles className="mb-3 h-6 w-6 text-vc-hover" aria-hidden />
        <p className="mb-1 text-[15px] font-medium text-vc-primary">No prompts yet</p>
        <p className="mb-4 max-w-md text-caption text-vc-tertiary">
          Generate {TRACKED_CAP} citation prompts tailored to {selectedBrand?.name ?? "your brand"},
          then refine them. The same set is re-checked on every run so trends stay comparable.
        </p>
        <Button
          data-testid="button-generate-prompts"
          disabled={generate.isPending}
          onClick={() =>
            generate.mutate(undefined, {
              onSuccess: (d: MutationBody) =>
                notify(d, "Prompts generated", "Couldn't generate prompts"),
            })
          }
        >
          {generate.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {generateMessage}
            </>
          ) : (
            `Generate ${TRACKED_CAP} citation prompts`
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2.5 border-b border-vc-accent/10 bg-vc-accent-subtle/30 px-4 py-2 sm:px-8">
        <p className="flex-1 text-caption leading-snug text-vc-secondary">
          Prompts are the questions people ask AI. The same set is re-checked on every run, so
          scores stay comparable week to week
          {promptsAgeLabel ? ` - seeded ${promptsAgeLabel}` : ""}.
        </p>
        <button
          type="button"
          onClick={() => setResetOpen(true)}
          data-testid="button-reset-prompts"
          className="flex flex-shrink-0 items-center gap-1 text-data font-medium text-vc-accent transition-colors hover:text-vc-accent-hover"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Reset all
        </button>
      </div>

      <PromptsTable
        rows={rows}
        historyLoading={historyLoading}
        suggestionCount={suggestions.length}
        cap={TRACKED_CAP}
        createPending={createPrompt.isPending}
        onOpen={openDetail}
        onEdit={(p, text) =>
          editPrompt.mutate(
            { promptId: p.id, text },
            { onSuccess: (d: MutationBody) => notify(d, "Prompt updated", "Update failed") },
          )
        }
        onDuplicate={(p) => {
          setDuplicating(p);
          setDuplicateText(p.prompt);
        }}
        onDiagnose={() => {
          void navigate({ to: "/diagnose", search: { tab: "signals" } });
        }}
        onCreateContent={() => {
          void navigate({ to: "/act", search: { tab: "create" } });
        }}
        onArchive={(p) => setArchiving(p)}
        onToggle={(p, next) =>
          setPromptStatus.mutate(
            { promptId: p.id, status: next },
            {
              onSuccess: ({ body }) => {
                if (!body.success) {
                  toast({
                    title: "Couldn't update",
                    description:
                      body.error === "tracked_set_full"
                        ? `That would exceed the cap of ${TRACKED_CAP}.`
                        : body.error,
                    variant: "destructive",
                  });
                }
              },
            },
          )
        }
        onReorder={(ids) => reorder.mutate(ids)}
        onCreate={create}
        onCreateMany={createMany}
        onSuggest={() => setSuggestionsOpen(true)}
        onExport={exportCsv}
      />

      {/* Duplicate - opens prefilled so the copy can be varied before saving */}
      <Dialog
        open={!!duplicating}
        onOpenChange={(o) => {
          if (!o) setDuplicating(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate prompt</DialogTitle>
            <DialogDescription>
              Vary the wording before saving - an exact copy is rejected, since two identical
              prompts double the run cost and split one prompt&apos;s results across two rows.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={duplicateText}
            maxLength={PROMPT_MAX_LEN}
            rows={4}
            onChange={(e) => setDuplicateText(e.target.value)}
          />
          <p className="text-right text-caption text-muted-foreground">
            {duplicateText.length}/{PROMPT_MAX_LEN}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicating(null)}>
              Cancel
            </Button>
            <Button
              disabled={!duplicateText.trim() || createPrompt.isPending}
              onClick={() => {
                create(duplicateText.trim());
                setDuplicating(null);
              }}
            >
              Add prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <AlertDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              It drops out of future runs. Past results are kept, so archiving does not erase
              history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!archiving) return;
                archivePrompt.mutate(archiving.id, {
                  onSuccess: (d: MutationBody) =>
                    notify(d, "Prompt archived", "Couldn't archive prompt"),
                });
                setArchiving(null);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset confirm - destructive, so it stays behind an explicit checkbox */}
      <AlertDialog
        open={resetOpen}
        onOpenChange={(o) => {
          setResetOpen(o);
          if (!o) setResetConfirmed(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset tracked prompts?</AlertDialogTitle>
            <AlertDialogDescription>
              This archives every tracked prompt and pending suggestion, then generates a fresh set
              of {TRACKED_CAP}. Past citation history is preserved, but week-over-week trends
              restart.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="mt-2 flex cursor-pointer items-start gap-2 text-caption">
            <input
              type="checkbox"
              checked={resetConfirmed}
              onChange={(e) => setResetConfirmed(e.target.checked)}
            />
            I understand this replaces the tracked set.
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!resetConfirmed}
              onClick={() => {
                reset.mutate(undefined, {
                  onSuccess: (d: MutationBody) => notify(d, "Prompts reset", "Reset failed"),
                });
                setResetOpen(false);
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suggestion ideas */}
      <Dialog open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prompt ideas</DialogTitle>
            <DialogDescription>
              AI-generated suggestions based on your brand and the gaps in your current set.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {suggestions.length === 0 ? (
              <p className="py-6 text-center text-caption text-muted-foreground">
                No suggestions right now. Refresh to generate a new batch.
              </p>
            ) : (
              suggestions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start gap-3 rounded border border-vc-default px-3 py-2"
                >
                  <div className="flex-1">
                    <p className="text-body text-vc-primary">{s.prompt}</p>
                    {s.rationale && (
                      <p className="mt-0.5 text-data italic text-vc-tertiary">{s.rationale}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`button-accept-suggestion-${s.id}`}
                    onClick={() => {
                      setAccepting(s);
                      setAcceptReplaceId("");
                    }}
                  >
                    Accept
                  </Button>
                  <button
                    type="button"
                    aria-label="Dismiss suggestion"
                    data-testid={`button-dismiss-suggestion-${s.id}`}
                    className="p-1 text-vc-text-muted transition-colors hover:text-vc-secondary"
                    onClick={() => dismissSuggestion.mutate(s.id)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={refreshSuggestions.isPending}
              onClick={() =>
                refreshSuggestions.mutate(undefined, {
                  onSuccess: (d: MutationBody) =>
                    notify(d, "Suggestions refreshed", "Couldn't refresh suggestions"),
                })
              }
            >
              {refreshSuggestions.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing
                </>
              ) : (
                "Refresh ideas"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Accept a suggestion - add when there's room, replace at the cap */}
      <Dialog open={!!accepting} onOpenChange={(o) => !o && setAccepting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {prompts.length < TRACKED_CAP
                ? "Add this prompt to your tracked set?"
                : "Replace which tracked prompt?"}
            </DialogTitle>
            <DialogDescription>
              {prompts.length < TRACKED_CAP
                ? `You have ${TRACKED_CAP - prompts.length} open slot${
                    TRACKED_CAP - prompts.length === 1 ? "" : "s"
                  } - accepting just adds it. Future runs will include it.`
                : `Your tracked set is at the cap of ${TRACKED_CAP}. Pick an existing prompt to archive so this one can take its slot.`}
            </DialogDescription>
          </DialogHeader>

          {accepting && (
            <div className="rounded border border-vc-accent/30 bg-vc-accent-subtle/40 p-3">
              <p className="mb-1 text-label font-semibold uppercase tracking-wider text-vc-accent">
                {prompts.length < TRACKED_CAP ? "Will be added" : "New (will be tracked)"}
              </p>
              <p className="text-body text-vc-primary">{accepting.prompt}</p>
            </div>
          )}

          {prompts.length >= TRACKED_CAP && (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {prompts.map((p, i) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-start gap-2 rounded border p-2 text-body transition-colors hover:bg-muted/40 ${
                    acceptReplaceId === p.id
                      ? "border-destructive bg-destructive/10"
                      : "border-vc-default"
                  }`}
                >
                  <input
                    type="radio"
                    name="replaceTracked"
                    checked={acceptReplaceId === p.id}
                    onChange={() => setAcceptReplaceId(p.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="mr-2 text-vc-text-muted">#{i + 1}</span>
                    {p.prompt}
                  </span>
                </label>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAccepting(null)}>
              Cancel
            </Button>
            <Button
              disabled={prompts.length >= TRACKED_CAP && !acceptReplaceId}
              onClick={() => {
                if (!accepting) return;
                const atCap = prompts.length >= TRACKED_CAP;
                if (atCap && !acceptReplaceId) return;
                acceptSuggestion.mutate(
                  {
                    suggestionId: accepting.id,
                    replaceTrackedId: atCap ? acceptReplaceId : null,
                  },
                  {
                    onSuccess: (d: MutationBody) =>
                      notify(d, "Suggestion accepted", "Couldn't accept suggestion"),
                  },
                );
                setAccepting(null);
              }}
            >
              {prompts.length < TRACKED_CAP ? "Add to tracked set" : "Confirm swap"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
