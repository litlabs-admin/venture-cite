import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLoadingMessages } from "@/hooks/use-loading-messages";
import { Sparkles, RefreshCw, Loader2, Pencil, Trash2, Check, X, Lightbulb } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Brand } from "@shared/schema";

// Wave 9: client-side cap on prompt length. Mirrors a sensible LLM context
// budget — 500 chars is plenty for a citation-style question while keeping
// the textarea readable. Server may impose a different limit; this cap
// just avoids round-tripping obviously-bad input.
const PROMPT_MAX_LEN = 500;

type BrandPrompt = {
  id: string;
  brandId: string;
  prompt: string;
  rationale: string | null;
  orderIndex: number;
  createdAt: string;
};

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

  const { data: suggestionsData } = useQuery<{ success: boolean; data: BrandPrompt[] }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}/suggestions`],
    enabled: !!selectedBrandId,
  });
  const suggestions = suggestionsData?.data || [];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/brand-prompts/${selectedBrandId}/generate`,
        {},
      );
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        // Instant update: write new prompts directly into cache
        queryClient.setQueryData([`/api/brand-prompts/${selectedBrandId}`], {
          success: true,
          data: data.data,
        });
        toast({
          title: "Prompts generated!",
          description: `Created ${data.data.length} citation prompts for ${selectedBrand?.name}.`,
        });
      } else {
        toast({
          title: "Couldn't generate prompts",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) =>
      toast({
        title: "Couldn't generate prompts",
        description: err.message,
        variant: "destructive",
      }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/brand-prompts/${selectedBrandId}/reset`, {
        confirm: true,
      });
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        invalidatePromptQueries();
        toast({ title: "Prompts reset" });
      } else {
        toast({ title: "Reset failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: Error) =>
      toast({ title: "Reset failed", description: err.message, variant: "destructive" }),
  });

  const invalidatePromptQueries = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/brand-prompts/${selectedBrandId}`] });
    queryClient.invalidateQueries({
      queryKey: [`/api/brand-prompts/${selectedBrandId}/suggestions`],
    });
  };

  const refreshSuggestionsMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/brand-prompts/${selectedBrandId}/suggestions/refresh`,
        {},
      );
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.setQueryData([`/api/brand-prompts/${selectedBrandId}/suggestions`], {
          success: true,
          data: data.data,
        });
        toast({
          title: "Suggestions refreshed",
          description: `${data.data.length} new ideas ready to review.`,
        });
      } else {
        toast({
          title: "Couldn't refresh",
          description: data.error || "Try again",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't refresh", description: err.message, variant: "destructive" }),
  });

  // Wave 9.1: Accept can run in two modes.
  //   * Add (tracked count < cap): just promote — no archive needed.
  //   * Replace (cap reached): caller picks a tracked prompt to retire.
  // Server enforces the cap; client picks the right body shape based on
  // current count so the dialog can render an "Add" UX vs the existing
  // "Replace" radio list.
  const acceptSuggestionMutation = useMutation({
    mutationFn: async ({
      suggestionId,
      replaceTrackedId,
    }: {
      suggestionId: string;
      replaceTrackedId: string | null;
    }) => {
      const r = await apiRequest(
        "POST",
        `/api/brand-prompts/${selectedBrandId}/suggestions/${suggestionId}/accept`,
        replaceTrackedId ? { replaceTrackedId } : {},
      );
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        invalidatePromptQueries();
        toast({
          title: "Suggestion accepted",
          description:
            data.data?.mode === "added" ? "Added to tracked set." : "Tracked set updated.",
        });
      } else {
        toast({
          title: "Couldn't accept",
          description: data.error || "Try again",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't accept", description: err.message, variant: "destructive" }),
  });

  const dismissSuggestionMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      const r = await apiRequest(
        "DELETE",
        `/api/brand-prompts/${selectedBrandId}/suggestions/${suggestionId}`,
      );
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({
          queryKey: [`/api/brand-prompts/${selectedBrandId}/suggestions`],
        });
      }
    },
  });

  // Wave 9: optimistic update — write the new text into the cache before
  // the server responds, rollback on error. ~500ms of unresponsive UI per
  // edit on slow networks goes to instant. Snapshot/restore on error.
  const editPromptMutation = useMutation({
    mutationFn: async ({ promptId, text }: { promptId: string; text: string }) => {
      const r = await apiRequest(
        "PATCH",
        `/api/brand-prompts/${selectedBrandId}/prompts/${promptId}`,
        { prompt: text },
      );
      return r.json();
    },
    onMutate: async ({ promptId, text }) => {
      const key = [`/api/brand-prompts/${selectedBrandId}`];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<{ success: boolean; data: BrandPrompt[] }>(key);
      if (previous?.data) {
        queryClient.setQueryData(key, {
          ...previous,
          data: previous.data.map((p) => (p.id === promptId ? { ...p, prompt: text } : p)),
        });
      }
      return { previous };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData([`/api/brand-prompts/${selectedBrandId}`], ctx.previous);
      }
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
    onSuccess: (data) => {
      if (data.success) {
        invalidatePromptQueries();
        toast({ title: "Prompt updated" });
      } else {
        // Server returned 200 but data.success=false — rollback via invalidate.
        invalidatePromptQueries();
        toast({
          title: "Update failed",
          description: data.error || "Try again",
          variant: "destructive",
        });
      }
    },
  });

  const archivePromptMutation = useMutation({
    mutationFn: async (promptId: string) => {
      const r = await apiRequest(
        "DELETE",
        `/api/brand-prompts/${selectedBrandId}/prompts/${promptId}`,
      );
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        invalidatePromptQueries();
        toast({ title: "Prompt archived" });
      } else {
        toast({
          title: "Couldn't archive",
          description: data.error || "Try again",
          variant: "destructive",
        });
      }
    },
  });

  const generateLoadingMessage = useLoadingMessages(generateMutation.isPending, [
    "Analyzing your brand...",
    "Reviewing published articles...",
    "Crafting strategic citation prompts...",
    "Scoring each prompt for AI visibility...",
    "Finalizing your portfolio...",
  ]);

  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [acceptingSuggestion, setAcceptingSuggestion] = useState<BrandPrompt | null>(null);
  // Wave 9: default to no selection so accidentally clicking Confirm on the
  // accept dialog can't silently nuke prompt #1 (previous default).
  const [acceptReplaceId, setAcceptReplaceId] = useState<string>("");
  // Wave 9: gate Reset all behind an explicit checkbox to avoid one-click
  // destructive actions. Reset is rare; the extra friction is the right
  // trade-off.
  const [resetConfirmed, setResetConfirmed] = useState(false);
  // Wave 9: confirmation gate for Refresh suggestions — it silently burns
  // an AI call from the user's monthly quota and was a one-click button.
  const [showRefreshSuggestionsConfirm, setShowRefreshSuggestionsConfirm] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-red-500" />
                Tracked prompts{" "}
                {hasPrompts && (
                  <span className="text-sm text-muted-foreground font-normal">
                    ({prompts.length} of 10)
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                These are the fixed questions re-checked every week so you can compare citation
                trends over time. Edit them to refine what's tracked.
                {promptsAgeLabel && <span className="ml-2 text-xs">Seeded {promptsAgeLabel}.</span>}
              </CardDescription>
            </div>
            {hasPrompts && (
              <AlertDialog
                onOpenChange={(open) => {
                  if (!open) setResetConfirmed(false);
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-reset-prompts">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reset all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset tracked prompts?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This archives all 10 tracked prompts and all pending suggestions, then
                      generates a fresh set of 10. Past citation history is preserved but
                      week-over-week trends will restart.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {/* Wave 9: explicit checkbox so a misclick can't trigger
                      a destructive 10-prompt rebuild. */}
                  <label className="flex items-start gap-2 text-sm cursor-pointer mt-2">
                    <input
                      type="checkbox"
                      checked={resetConfirmed}
                      onChange={(e) => setResetConfirmed(e.target.checked)}
                      className="mt-0.5"
                      data-testid="checkbox-reset-confirm"
                    />
                    <span>
                      I understand this archives all {prompts.length} tracked prompts and all
                      pending suggestions.
                    </span>
                  </label>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={resetMutation.isPending || !resetConfirmed}
                      onClick={(e) => {
                        if (resetMutation.isPending || !resetConfirmed) {
                          e.preventDefault();
                          return;
                        }
                        resetMutation.mutate();
                      }}
                    >
                      {resetMutation.isPending ? "Resetting…" : "Reset"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {promptsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !hasPrompts ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                No prompts yet. Generate 10 citation prompts tailored to your brand profile and
                published articles — these become the locked set we track weekly.
              </p>
              <Button
                onClick={() => {
                  if (generateMutation.isPending || !selectedBrandId) return;
                  generateMutation.mutate();
                }}
                disabled={generateMutation.isPending || !selectedBrandId}
                className="bg-primary hover:bg-primary/90"
                data-testid="button-generate-prompts"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {generateLoadingMessage}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate 10 Citation Prompts
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {prompts.map((p, i) => {
                const isEditing = editingPromptId === p.id;
                return (
                  <div
                    key={p.id}
                    className="border border-border rounded-lg p-4"
                    data-testid={`prompt-row-${i}`}
                  >
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5 shrink-0">
                        {i + 1}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editingText}
                              onChange={(e) =>
                                setEditingText(e.target.value.slice(0, PROMPT_MAX_LEN))
                              }
                              className="min-h-[60px]"
                              maxLength={PROMPT_MAX_LEN}
                              autoFocus
                            />
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const trimmed = editingText.trim();
                                    // Wave 9: client-side validation. Empty
                                    // and over-length values are rejected
                                    // with a toast rather than silently
                                    // dropped. No-op on unchanged text.
                                    if (!trimmed) {
                                      toast({
                                        title: "Prompt can't be empty",
                                        variant: "destructive",
                                      });
                                      return;
                                    }
                                    if (trimmed.length > PROMPT_MAX_LEN) {
                                      toast({
                                        title: `Prompt is too long (${trimmed.length}/${PROMPT_MAX_LEN})`,
                                        variant: "destructive",
                                      });
                                      return;
                                    }
                                    if (trimmed !== p.prompt) {
                                      editPromptMutation.mutate({
                                        promptId: p.id,
                                        text: trimmed,
                                      });
                                    }
                                    setEditingPromptId(null);
                                  }}
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" />
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingPromptId(null)}
                                >
                                  <X className="h-3.5 w-3.5 mr-1" />
                                  Cancel
                                </Button>
                              </div>
                              <span
                                className={`text-xs tabular-nums ${
                                  editingText.length >= PROMPT_MAX_LEN
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {editingText.length}/{PROMPT_MAX_LEN}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="font-medium text-foreground">{p.prompt}</p>
                            {p.rationale && (
                              <p className="text-sm text-muted-foreground mt-1 italic">
                                {p.rationale}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                      {!isEditing && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingPromptId(p.id);
                              setEditingText(p.prompt);
                            }}
                            data-testid={`button-edit-prompt-${i}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`button-archive-prompt-${i}`}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove this tracked prompt?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Future weekly runs won&apos;t include it. Past citation history
                                  for this prompt stays intact, but the week-over-week trend line
                                  will gap until a replacement is accepted. You can accept a
                                  suggestion later to backfill the slot.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => archivePromptMutation.mutate(p.id)}
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SUGGESTIONS */}
      {hasPrompts && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  Suggested prompts{" "}
                  {suggestions.length > 0 && (
                    <span className="text-sm text-muted-foreground font-normal">
                      ({suggestions.length})
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  After each weekly run we propose 5 new questions that cover angles your tracked
                  set misses. Accept one to swap it in for a tracked prompt you want to retire.
                </CardDescription>
              </div>
              {/* Wave 9: confirm before burning AI quota. */}
              <AlertDialog
                open={showRefreshSuggestionsConfirm}
                onOpenChange={setShowRefreshSuggestionsConfirm}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={refreshSuggestionsMutation.isPending}
                    data-testid="button-refresh-suggestions"
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-2 ${refreshSuggestionsMutation.isPending ? "animate-spin" : ""}`}
                    />
                    {suggestions.length === 0 ? "Generate suggestions" : "Refresh"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Generate fresh suggestions?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This uses 1 AI call from your monthly quota and replaces any pending
                      suggestions you haven&apos;t accepted yet.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        refreshSuggestionsMutation.mutate();
                        setShowRefreshSuggestionsConfirm(false);
                      }}
                    >
                      Generate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardHeader>
          <CardContent>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No suggestions yet. They'll appear after the next weekly run — or click Refresh to
                generate now.
              </p>
            ) : (
              <div className="space-y-3">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="border border-border rounded-lg p-4 bg-amber-50/40 dark:bg-amber-900/10"
                    data-testid={`suggestion-${s.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <Lightbulb className="h-4 w-4 text-amber-500 mt-1 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{s.prompt}</p>
                        {s.rationale && (
                          <p className="text-sm text-muted-foreground mt-1 italic">{s.rationale}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => {
                            setAcceptingSuggestion(s);
                            // Wave 9: no default selection so a misclick on
                            // Confirm can't silently nuke prompt #1.
                            setAcceptReplaceId("");
                          }}
                          data-testid={`button-accept-suggestion-${s.id}`}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Accept
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => dismissSuggestionMutation.mutate(s.id)}
                          data-testid={`button-dismiss-suggestion-${s.id}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ACCEPT MODAL */}
      <Dialog
        open={!!acceptingSuggestion}
        onOpenChange={(open) => {
          if (!open) setAcceptingSuggestion(null);
        }}
      >
        <DialogContent>
          {/* Wave 9.1: dialog has two modes.
              * Add (slot open, prompts.length < cap): just promote — no
                radio list, no replacement choice. Confirm = "Add to set".
              * Replace (cap reached): pick a tracked prompt to archive.
              Previously this dialog forced "replace" even after the user
              had explicitly deleted a prompt to make room — bad UX. */}
          {(() => {
            const TRACKED_CAP = 10;
            const hasOpenSlot = prompts.length < TRACKED_CAP;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {hasOpenSlot
                      ? "Add this prompt to your tracked set?"
                      : "Replace which tracked prompt?"}
                  </DialogTitle>
                  <DialogDescription>
                    {hasOpenSlot
                      ? `You have ${TRACKED_CAP - prompts.length} open slot${TRACKED_CAP - prompts.length === 1 ? "" : "s"} — accepting just adds the suggestion. Future weekly runs will include it.`
                      : `Your tracked set is at the cap of ${TRACKED_CAP}. Pick an existing prompt to archive so this one can take its slot.`}
                  </DialogDescription>
                </DialogHeader>
                {acceptingSuggestion && (
                  <div className="space-y-3">
                    {/* New-prompt preview is shown in both modes. */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="text-sm p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
                        <div className="text-amber-700 dark:text-amber-300 font-medium text-xs uppercase tracking-wide mb-1">
                          {hasOpenSlot ? "Will be added" : "New (will be tracked)"}
                        </div>
                        <div className="text-foreground">{acceptingSuggestion.prompt}</div>
                        {acceptingSuggestion.rationale && (
                          <div className="text-xs text-muted-foreground italic mt-1">
                            {acceptingSuggestion.rationale}
                          </div>
                        )}
                      </div>
                      {/* Replace-side panel only renders in replace mode.
                          In add mode there's nothing to preview. */}
                      {!hasOpenSlot && (
                        <div
                          className={`text-sm p-3 rounded border ${
                            acceptReplaceId
                              ? "border-red-300 bg-red-50/50 dark:bg-red-900/20 dark:border-red-900"
                              : "border-dashed border-muted-foreground/40 bg-muted/30"
                          }`}
                        >
                          <div
                            className={`font-medium text-xs uppercase tracking-wide mb-1 ${
                              acceptReplaceId
                                ? "text-red-700 dark:text-red-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            Replacing (will be archived)
                          </div>
                          {acceptReplaceId ? (
                            (() => {
                              const old = prompts.find((p) => p.id === acceptReplaceId);
                              return old ? (
                                <>
                                  <div className="text-foreground line-through opacity-80">
                                    {old.prompt}
                                  </div>
                                  {old.rationale && (
                                    <div className="text-xs text-muted-foreground italic mt-1">
                                      {old.rationale}
                                    </div>
                                  )}
                                </>
                              ) : null;
                            })()
                          ) : (
                            <div className="text-muted-foreground italic">
                              Pick a tracked prompt below to preview the swap.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Replace-list only renders when the cap is hit. */}
                    {!hasOpenSlot && (
                      <div className="space-y-2 max-h-[280px] overflow-y-auto">
                        {prompts.map((p, i) => (
                          <label
                            key={p.id}
                            className={`flex items-start gap-2 p-2 rounded border cursor-pointer hover:bg-muted/40 ${acceptReplaceId === p.id ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-border"}`}
                          >
                            <input
                              type="radio"
                              name="replaceTracked"
                              value={p.id}
                              checked={acceptReplaceId === p.id}
                              onChange={() => setAcceptReplaceId(p.id)}
                              className="mt-1"
                            />
                            <div className="text-sm">
                              <span className="text-muted-foreground mr-2">#{i + 1}</span>
                              <span className="text-foreground">{p.prompt}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAcceptingSuggestion(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (!acceptingSuggestion) return;
                      // Add mode: replaceTrackedId=null. Server validates
                      // the tracked count is under cap before promoting.
                      // Replace mode: must have a radio selection.
                      if (!hasOpenSlot && !acceptReplaceId) return;
                      acceptSuggestionMutation.mutate({
                        suggestionId: acceptingSuggestion.id,
                        replaceTrackedId: hasOpenSlot ? null : acceptReplaceId,
                      });
                      setAcceptingSuggestion(null);
                    }}
                    disabled={!hasOpenSlot && !acceptReplaceId}
                  >
                    {hasOpenSlot ? "Add to tracked set" : "Confirm swap"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { BrandPrompt };
