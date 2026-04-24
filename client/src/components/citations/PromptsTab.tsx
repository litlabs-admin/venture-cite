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

  const acceptSuggestionMutation = useMutation({
    mutationFn: async ({
      suggestionId,
      replaceTrackedId,
    }: {
      suggestionId: string;
      replaceTrackedId: string;
    }) => {
      const r = await apiRequest(
        "POST",
        `/api/brand-prompts/${selectedBrandId}/suggestions/${suggestionId}/accept`,
        { replaceTrackedId },
      );
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        invalidatePromptQueries();
        toast({ title: "Suggestion accepted", description: "Tracked set updated." });
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

  const editPromptMutation = useMutation({
    mutationFn: async ({ promptId, text }: { promptId: string; text: string }) => {
      const r = await apiRequest(
        "PATCH",
        `/api/brand-prompts/${selectedBrandId}/prompts/${promptId}`,
        { prompt: text },
      );
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        invalidatePromptQueries();
        toast({ title: "Prompt updated" });
      } else {
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
  const [acceptReplaceId, setAcceptReplaceId] = useState<string>("");

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
              <AlertDialog>
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
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={resetMutation.isPending}
                      onClick={(e) => {
                        if (resetMutation.isPending) {
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
                className="bg-red-600 hover:bg-red-700"
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
                              onChange={(e) => setEditingText(e.target.value)}
                              className="min-h-[60px]"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (editingText.trim() && editingText.trim() !== p.prompt) {
                                    editPromptMutation.mutate({
                                      promptId: p.id,
                                      text: editingText.trim(),
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
                                  Future weekly runs won't include it. Past citation history stays
                                  intact. You can accept a suggestion later to backfill the slot.
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshSuggestionsMutation.mutate()}
                disabled={refreshSuggestionsMutation.isPending}
                data-testid="button-refresh-suggestions"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${refreshSuggestionsMutation.isPending ? "animate-spin" : ""}`}
                />
                {suggestions.length === 0 ? "Generate suggestions" : "Refresh"}
              </Button>
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
                            setAcceptReplaceId(prompts[0]?.id || "");
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
          <DialogHeader>
            <DialogTitle>Replace which tracked prompt?</DialogTitle>
            <DialogDescription>
              The suggestion below will become tracked. Pick an existing tracked prompt to archive
              in its place so the set stays at {prompts.length}.
            </DialogDescription>
          </DialogHeader>
          {acceptingSuggestion && (
            <div className="space-y-3">
              <div className="text-sm p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
                <span className="text-amber-700 dark:text-amber-300 font-medium">New:</span>{" "}
                <span className="text-foreground">{acceptingSuggestion.prompt}</span>
              </div>
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
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
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAcceptingSuggestion(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (acceptingSuggestion && acceptReplaceId) {
                  acceptSuggestionMutation.mutate({
                    suggestionId: acceptingSuggestion.id,
                    replaceTrackedId: acceptReplaceId,
                  });
                  setAcceptingSuggestion(null);
                }
              }}
              disabled={!acceptReplaceId}
            >
              Confirm swap
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { BrandPrompt };
