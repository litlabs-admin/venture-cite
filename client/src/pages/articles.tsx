// Articles list page (Wave 7 rebuild).
//
// Status-aware: shows status badges for non-ready rows, brand chips on every
// card, derived excerpts when missing, formatted view counts, +N more
// keyword overflow indicators, bulk delete, and a Status filter.
//
// View/Edit/Auto-Improve/Versions live inside <ViewEditDialog>; distribution
// lives inside <DistributeDialog>. Both extracted from the legacy giant page.

import { useEffect, useMemo, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Loader2, FileText, Eye, Calendar, Tag, Search, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/PageHeader";
import ViewEditDialog from "@/components/articles/ViewEditDialog";
import DistributeDialog from "@/components/articles/DistributeDialog";
import type { Article, Brand } from "@shared/schema";

const STATUS_OPTIONS = [
  { value: "ready", label: "Ready" },
  { value: "draft,generating,failed", label: "Drafts & failures" },
  { value: "generating", label: "Generating" },
  { value: "failed", label: "Failed" },
  { value: "all", label: "All" },
];

function formatViewCount(n: number): string {
  return new Intl.NumberFormat().format(n);
}

function deriveExcerpt(article: Article): string {
  if (article.excerpt) return article.excerpt;
  if (!article.content) return "";
  // First non-empty, non-heading paragraph, truncated to ~160 chars.
  const paragraphs = article.content
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith("#"));
  if (paragraphs.length === 0) return "";
  const first = paragraphs[0];
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ready") return null;
  const cls =
    status === "generating"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      : status === "failed"
        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        : "bg-muted text-muted-foreground";
  const label = status === "generating" ? "Generating…" : status === "failed" ? "Failed" : "Draft";
  return (
    <Badge variant="secondary" className={`text-[10px] ${cls}`}>
      {status === "generating" && <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin inline" />}
      {label}
    </Badge>
  );
}

export default function Articles() {
  const { toast } = useToast();
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const editId = new URLSearchParams(searchString).get("edit");
  const qc = useQueryClient();

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ready");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Selection (for bulk delete)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Articles list — server-side status filter so we don't pull drafts when
  // the user only wants ready articles.
  const articlesQuery = useQuery<{ success: boolean; data: Article[] }>({
    queryKey: ["/api/articles", "list", statusFilter],
    queryFn: async () => {
      const qs = new URLSearchParams({ limit: "200" });
      qs.set("status", statusFilter);
      const r = await apiRequest("GET", `/api/articles?${qs.toString()}`);
      return r.json();
    },
  });
  const articles = articlesQuery.data?.data ?? [];

  const { data: brandsData } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });
  const brands = brandsData?.data ?? [];
  const brandsById = useMemo(() => {
    const m = new Map<string, Brand>();
    for (const b of brands) m.set(b.id, b);
    return m;
  }, [brands]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/articles/${id}`),
    onSuccess: (_data, deletedId) => {
      qc.setQueryData<{ success: boolean; data: Article[] }>(
        ["/api/articles", "list", statusFilter],
        (old) => (old ? { ...old, data: old.data.filter((a) => a.id !== deletedId) } : old),
      );
      toast({ title: "Article deleted" });
    },
    onError: () =>
      toast({ title: "Couldn't delete", description: "Try again.", variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Sequential — small N, no need for parallelism.
      for (const id of ids) {
        await apiRequest("DELETE", `/api/articles/${id}`);
      }
    },
    onSuccess: (_data, ids) => {
      qc.setQueryData<{ success: boolean; data: Article[] }>(
        ["/api/articles", "list", statusFilter],
        (old) => (old ? { ...old, data: old.data.filter((a) => !ids.includes(a.id)) } : old),
      );
      setSelected(new Set());
      toast({ title: `${ids.length} article${ids.length === 1 ? "" : "s"} deleted` });
    },
  });

  // Reset paging + selection whenever filters change.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setSelected(new Set());
  }, [statusFilter, brandFilter, sortBy, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = articles;
    if (brandFilter !== "all") list = list.filter((a) => a.brandId === brandFilter);
    if (q) {
      list = list.filter((a) => {
        const t = (a.title || "").toLowerCase();
        const ex = (a.excerpt || "").toLowerCase();
        const kw = (a.keywords || []).join(" ").toLowerCase();
        return t.includes(q) || ex.includes(q) || kw.includes(q);
      });
    }
    const sorted = [...list];
    if (sortBy === "newest") {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === "oldest") {
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else {
      sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    return sorted;
  }, [articles, brandFilter, search, sortBy]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.has(a.id));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const a of visible) next.delete(a.id);
        return next;
      }
      const next = new Set(prev);
      for (const a of visible) next.add(a.id);
      return next;
    });
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader title="Your Articles" description="Manage your GEO-optimized content" />

        {articlesQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : articles.length === 0 && statusFilter === "ready" ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No articles yet</h3>
              <p className="text-muted-foreground mb-4">
                Generate and save content to see your articles here.
              </p>
              <Link href="/content">
                <Button>Create Your First Article</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title, excerpt, or keyword…"
                  className="pl-9"
                  data-testid="input-articles-search"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-articles-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {brands.length > 1 && (
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger
                    className="w-full sm:w-[200px]"
                    data-testid="select-articles-brand"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All brands</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-articles-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="title">Title (A–Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bulk action toolbar — shown when anything is selected. */}
            {selected.size > 0 && (
              <div className="flex items-center justify-between p-2 px-3 border rounded-md bg-muted/50">
                <span className="text-sm">
                  {selected.size} selected
                  <button
                    onClick={() => setSelected(new Set())}
                    className="ml-3 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Delete selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selected.size} article(s)?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Their distribution history and revisions will also be deleted. This cannot
                        be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => bulkDeleteMutation.mutate(Array.from(selected))}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {/* Select-all (only when there are articles to act on) */}
            {visible.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  id="select-all"
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAll}
                />
                <label
                  htmlFor="select-all"
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  Select all {visible.length} on this page
                </label>
              </div>
            )}

            {filtered.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  {search ? (
                    <>
                      No articles match &ldquo;{search}&rdquo;.
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setSearch("")}
                        className="ml-2"
                      >
                        Clear search
                      </Button>
                    </>
                  ) : (
                    "No articles match the current filter."
                  )}
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-4">
              {visible.map((article) => {
                const brand = article.brandId ? brandsById.get(article.brandId) : null;
                const excerpt = deriveExcerpt(article);
                const visibleKeywords = (article.keywords || []).slice(0, 5);
                const overflowKeywords = (article.keywords || []).slice(5);
                return (
                  <Card key={article.id} data-testid={`card-article-${article.id}`}>
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selected.has(article.id)}
                          onCheckedChange={() => toggleSelected(article.id)}
                          className="mt-1.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <CardTitle
                              className="text-xl break-words"
                              data-testid={`title-${article.id}`}
                            >
                              {article.title || "Untitled"}
                            </CardTitle>
                            <StatusBadge status={article.status ?? "ready"} />
                          </div>
                          {excerpt && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{excerpt}</p>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
                        {brand && (
                          <Badge variant="outline" className="font-normal">
                            {brand.name}
                          </Badge>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 cursor-default">
                              <Calendar className="w-4 h-4" />
                              {formatDistanceToNow(new Date(article.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {format(new Date(article.createdAt), "PPpp")}
                          </TooltipContent>
                        </Tooltip>
                        {article.viewCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Eye className="w-4 h-4" />
                            {formatViewCount(article.viewCount)} views
                          </span>
                        )}
                        {article.industry && (
                          <span className="flex items-center gap-1">
                            <Tag className="w-4 h-4" />
                            {article.industry}
                          </span>
                        )}
                      </div>

                      {visibleKeywords.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {visibleKeywords.map((kw, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {kw}
                            </Badge>
                          ))}
                          {overflowKeywords.length > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="text-xs cursor-default">
                                  +{overflowKeywords.length} more
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="max-w-xs flex flex-wrap gap-1">
                                  {overflowKeywords.map((kw, idx) => (
                                    <span
                                      key={idx}
                                      className="text-[10px] bg-muted px-1.5 py-0.5 rounded"
                                    >
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2 flex-wrap">
                        <ViewEditDialog
                          article={article}
                          autoOpen={editId === article.id}
                          onAutoOpenHandled={() => setLocation("/articles", { replace: true })}
                        />
                        {article.status === "ready" && <DistributeDialog articleId={article.id} />}
                        {article.status === "draft" && (
                          <Link href={`/content/${article.id}`}>
                            <Button variant="outline" size="sm">
                              Continue draft
                            </Button>
                          </Link>
                        )}
                        {article.status === "failed" && (
                          <Link href={`/content/${article.id}`}>
                            <Button variant="outline" size="sm">
                              Retry generation
                            </Button>
                          </Link>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete article?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete &quot;{article.title || "Untitled"}
                                &quot; along with its revisions and distribution history. This
                                cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(article.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete permanently
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {hasMore && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  className="text-sm text-primary hover:underline"
                  data-testid="button-load-more-articles"
                >
                  Load {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more
                  {" · "}
                  <span className="text-muted-foreground">
                    showing {visibleCount} of {filtered.length}
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
