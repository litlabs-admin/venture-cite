// View / Edit / Improve / Versions dialog for a single article (Wave 7).
//
// Replaces the legacy <Textarea>-only editor inside articles.tsx. Uses the
// shared <MarkdownEditor> (split-pane editor + preview), always sends
// expectedVersion on save, surfaces a real conflict modal on 409, and adds
// the Auto-Improve action plus a Versions tab with diff/restore.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, Pencil, Sparkles, History, Save } from "lucide-react";
import MarkdownEditor from "@/components/content/MarkdownEditor";
import SafeMarkdown from "@/components/SafeMarkdown";
import RevisionDiff from "@/components/articles/RevisionDiff";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { Article, ArticleRevision } from "@shared/schema";

type Tab = "view" | "edit" | "versions";

interface ViewEditDialogProps {
  article: Article;
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
}

export default function ViewEditDialog({
  article,
  autoOpen = false,
  onAutoOpenHandled,
}: ViewEditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("view");
  const [title, setTitle] = useState(article.title ?? "");
  const [content, setContent] = useState(article.content ?? "");
  const [expectedVersion, setExpectedVersion] = useState(article.version);
  const [conflict, setConflict] = useState<Article | null>(null);
  // The last "before" content snapshot when Auto-Improve runs, so we can
  // show a diff and offer Restore in the same flow without an extra round trip.
  const [improvePreviousContent, setImprovePreviousContent] = useState<string | null>(null);
  // Track the revision currently being viewed in the diff (Versions tab).
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);

  useEffect(() => {
    if (autoOpen && !open) {
      setOpen(true);
      setTab("edit");
      onAutoOpenHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  // Re-hydrate when the article prop changes — covers the case where the
  // parent list refetches after a save.
  useEffect(() => {
    setTitle(article.title ?? "");
    setContent(article.content ?? "");
    setExpectedVersion(article.version);
  }, [article.id, article.version]);

  const revisionsQuery = useQuery<{ success: boolean; data: ArticleRevision[] }>({
    queryKey: ["/api/articles", article.id, "revisions"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/articles/${article.id}/revisions`);
      return r.json();
    },
    enabled: open && tab === "versions",
  });
  const revisions = revisionsQuery.data?.data ?? [];

  // Default the diff selection to the most recent revision once the list loads.
  useEffect(() => {
    if (tab !== "versions") return;
    if (selectedRevisionId) return;
    if (revisions.length > 0) setSelectedRevisionId(revisions[0].id);
  }, [tab, revisions, selectedRevisionId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PUT", `/api/articles/${article.id}`, {
        title,
        content,
        expectedVersion,
      });
      const json = await r.json();
      if (r.status === 409) {
        setConflict(json.current as Article);
        throw new Error("version_conflict");
      }
      return json;
    },
    onSuccess: (data) => {
      const updated = data.article as Article;
      setExpectedVersion(updated.version);
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      toast({ title: "Saved", description: "Article updated." });
    },
    onError: (e: Error) => {
      if (e.message === "version_conflict") return; // conflict modal handles it
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    },
  });

  const improveMutation = useMutation({
    mutationFn: async () => {
      const before = content;
      setImprovePreviousContent(before);
      const r = await apiRequest("POST", `/api/articles/${article.id}/improve`, {
        expectedVersion,
      });
      const json = await r.json();
      if (r.status === 409) {
        setConflict(json.current as Article);
        throw new Error("version_conflict");
      }
      return json;
    },
    onSuccess: (data) => {
      const updated = data.article as Article;
      setContent(updated.content ?? "");
      setExpectedVersion(updated.version);
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/articles", article.id, "revisions"] });
      toast({ title: "Improved", description: "Auto-Improve finished. Review the diff below." });
    },
    onError: (e: Error) => {
      if (e.message === "version_conflict") return;
      toast({ title: "Couldn't improve", description: e.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (revisionId: string) => {
      const r = await apiRequest(
        "POST",
        `/api/articles/${article.id}/revisions/${revisionId}/restore`,
        { expectedVersion },
      );
      const json = await r.json();
      if (r.status === 409) {
        setConflict(json.current as Article);
        throw new Error("version_conflict");
      }
      return json;
    },
    onSuccess: (data) => {
      const updated = data.article as Article;
      setContent(updated.content ?? "");
      setExpectedVersion(updated.version);
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/articles", article.id, "revisions"] });
      setTab("edit");
      toast({ title: "Restored", description: "Older version restored." });
    },
    onError: (e: Error) => {
      if (e.message === "version_conflict") return;
      toast({ title: "Couldn't restore", description: e.message, variant: "destructive" });
    },
  });

  const selectedRevision = useMemo(
    () => revisions.find((r) => r.id === selectedRevisionId) ?? null,
    [revisions, selectedRevisionId],
  );

  const handleClose = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Reset volatile state on close so reopen starts fresh.
      setTab("view");
      setTitle(article.title ?? "");
      setContent(article.content ?? "");
      setExpectedVersion(article.version);
      setImprovePreviousContent(null);
      setSelectedRevisionId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" data-testid={`button-view-${article.id}`}>
            <Eye className="w-4 h-4 mr-2" /> View / Edit
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{article.title || "Untitled"}</DialogTitle>
            <DialogDescription>Version {article.version}</DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 border-b pb-2 mb-3">
            <Button
              variant={tab === "view" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTab("view")}
            >
              <Eye className="w-3 h-3 mr-1" /> View
            </Button>
            <Button
              variant={tab === "edit" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTab("edit")}
            >
              <Pencil className="w-3 h-3 mr-1" /> Edit
            </Button>
            <Button
              variant={tab === "versions" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTab("versions")}
            >
              <History className="w-3 h-3 mr-1" /> Versions
            </Button>
          </div>

          {tab === "view" && (
            <div className="prose prose-sm dark:prose-invert max-w-none border rounded-md p-4 bg-card max-h-[65vh] overflow-y-auto">
              {content ? (
                <SafeMarkdown>{content}</SafeMarkdown>
              ) : (
                <p className="text-muted-foreground italic">No content yet.</p>
              )}
            </div>
          )}

          {tab === "edit" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Title</label>
                <input
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <MarkdownEditor value={content} onChange={setContent} />

              {improvePreviousContent !== null && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Auto-Improve diff</h4>
                  <RevisionDiff before={improvePreviousContent} after={content} context={2} />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Restore the pre-improve content. Persists via save.
                        setContent(improvePreviousContent);
                        setImprovePreviousContent(null);
                        toast({ title: "Reverted", description: "Click Save to persist." });
                      }}
                    >
                      Discard improvements
                    </Button>
                    <Button size="sm" onClick={() => setImprovePreviousContent(null)}>
                      Keep improvements
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => improveMutation.mutate()}
                  disabled={improveMutation.isPending || !content}
                >
                  {improveMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Improving…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" /> Auto-Improve
                    </>
                  )}
                </Button>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" /> Save
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {tab === "versions" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1 border rounded-md max-h-[60vh] overflow-y-auto">
                {revisionsQuery.isLoading ? (
                  <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                ) : revisions.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground italic">No revisions yet.</div>
                ) : (
                  <ul className="divide-y">
                    {revisions.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedRevisionId(r.id)}
                          className={`w-full text-left p-3 hover:bg-accent transition-colors ${
                            selectedRevisionId === r.id ? "bg-primary/10" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="text-[10px] uppercase">
                              {r.source.replace(/_/g, " ")}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="md:col-span-2 space-y-3">
                {selectedRevision ? (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Comparing this revision against the current article.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restoreMutation.mutate(selectedRevision.id)}
                        disabled={restoreMutation.isPending}
                      >
                        {restoreMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          "Restore this version"
                        )}
                      </Button>
                    </div>
                    <RevisionDiff before={selectedRevision.content} after={content} context={2} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Pick a revision on the left to view its diff.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Conflict modal — opens when any save/improve/restore returns 409 */}
      <Dialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Article changed elsewhere</DialogTitle>
            <DialogDescription>
              Someone else (or you in another tab) edited this article since you started editing.
              Pick how to resolve it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                if (!conflict) return;
                // Discard local edits and adopt server's content.
                setTitle(conflict.title ?? "");
                setContent(conflict.content ?? "");
                setExpectedVersion(conflict.version);
                setConflict(null);
                toast({ title: "Reloaded", description: "Showing the latest content." });
              }}
            >
              Reload latest (discards your changes)
            </Button>
            <Button
              className="w-full"
              variant="default"
              onClick={() => {
                // Bump local expectedVersion to match server, retry save.
                if (!conflict) return;
                setExpectedVersion(conflict.version);
                setConflict(null);
                saveMutation.mutate();
              }}
            >
              Force-save my changes (overwrites their changes)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
