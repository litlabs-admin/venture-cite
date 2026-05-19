// Coverage — the gap-detection half of the dissolved GEO Assets page.
// /act 2b: listicles + Wikipedia are "where your brand should appear in
// AI-cited sources but doesn't" — a Diagnose question, not authored
// content. They move here wholesale (scan/discover, the tracked lists,
// the inseparable lightweight response: outreach status + the Wikipedia
// draft helper, manual-add). BOFU was authored content and moved into
// the unified /act Production pipeline instead. One stacked surface — no
// inner tabs (the spine tab IS the navigation).
//
// Tour engine targets (literal data-tour-id strings for the verifier):
//   data-tour-id="listicles.firstResult"  (first-listicle-found nudge)
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Listicle, WikipediaMention } from "@shared/schema";
import { StatusDot } from "@/components/foundations";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import {
  List,
  BookOpen,
  Sparkles,
  ExternalLink,
  Target,
  CheckCircle,
  XCircle,
  Search,
  Plus,
  Loader2,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

// Pretty-print scan reports as a one-line toast description, hiding
// zero-valued lines so a clean run shows just the meaningful counts.
function formatReportLines(items: Record<string, number | undefined>): string {
  return Object.entries(items)
    .filter(([, n]) => typeof n === "number" && n > 0)
    .map(([k, n]) => `${k}: ${n}`)
    .join(" · ");
}

const LISTICLE_STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-muted text-foreground hover:bg-muted" },
  contacted: { label: "Contacted", className: "bg-chart-1/15 text-chart-1 hover:bg-chart-1/15" },
  won: { label: "Won", className: "bg-chart-4/15 text-chart-4 hover:bg-chart-4/15" },
  dropped: { label: "Dropped", className: "bg-muted text-muted-foreground hover:bg-muted" },
};

function SummaryCard({
  label,
  primary,
  secondary,
  testId,
}: {
  label: string;
  primary: string;
  secondary: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-4 pb-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{primary}</div>
        <div className="text-xs text-muted-foreground mt-1">{secondary}</div>
      </CardContent>
    </Card>
  );
}

export default function Coverage() {
  const { toast } = useToast();
  const { selectedBrandId, selectedBrand } = useBrandSelection();
  const [addListicleOpen, setAddListicleOpen] = useState(false);
  const [addWikipediaOpen, setAddWikipediaOpen] = useState(false);
  const [wikiDraft, setWikiDraft] = useState<{
    mentionId: string;
    pageTitle: string;
    text: string;
    notes: string[];
  } | null>(null);
  const [listicleStatusFilter, setListicleStatusFilter] = useState<string>("all");

  // Listicle queries — server returns { success, data: Listicle[] }
  const {
    data: listiclesData,
    isLoading: listiclesLoading,
    isError: listiclesIsError,
    isRefetching: listiclesIsRefetching,
    refetch: refetchListicles,
  } = useQuery<{ success: boolean; data: Listicle[] }>({
    queryKey: ["/api/listicles", { brandId: selectedBrandId }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/listicles?brandId=${selectedBrandId}`);
      return res.json();
    },
    enabled: !!selectedBrandId,
  });
  const listicles: Listicle[] = listiclesData?.data ?? [];

  const discoverListiclesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/listicles/discover/${selectedBrandId}`);
      const body = await response.json();
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || `Discovery failed (${response.status})`);
      }
      return body;
    },
    onSuccess: (data: any) => {
      const r = data.data?.report ?? {};
      const summary = formatReportLines({
        Found: r.found ?? 0,
        Inserted: r.inserted ?? 0,
        Duplicates: r.skippedDuplicate ?? 0,
        Filtered: r.skippedFiltered ?? 0,
        "Re-verified": r.reverified ?? 0,
        "Lost inclusion": r.lostInclusion ?? 0,
        Failed: r.failed?.length ?? 0,
      });
      toast({
        title: "Listicle scan complete",
        description: [r.warning, summary].filter(Boolean).join("\n"),
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/listicles",
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/geo-tools/summary",
      });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to discover listicles",
        description: err?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  // Wikipedia queries — read mentions directly from storage
  const { data: wikipediaData } = useQuery<{ success: boolean; data: WikipediaMention[] }>({
    queryKey: ["/api/wikipedia", selectedBrandId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/wikipedia/${selectedBrandId}`);
      return res.json();
    },
    enabled: !!selectedBrandId,
  });
  const wikipediaMentions: WikipediaMention[] = wikipediaData?.data ?? [];
  const wikiExistingRows = wikipediaMentions.filter((m) => m.mentionType === "existing");
  const wikiOpportunityRows = wikipediaMentions.filter((m) => m.mentionType === "opportunity");

  const scanWikipediaMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/wikipedia/scan/${selectedBrandId}`);
      const body = await response.json();
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || `Wikipedia scan failed (${response.status})`);
      }
      return body;
    },
    onSuccess: (data: any) => {
      const r = data.data?.report ?? {};
      const summary = formatReportLines({
        Existing: r.existing ?? data.data?.existing ?? 0,
        Opportunities: r.opportunities ?? data.data?.opportunities ?? 0,
        Inserted: r.inserted ?? data.data?.inserted ?? 0,
        Duplicates: r.skippedDuplicate ?? 0,
        Failed: r.failed?.length ?? 0,
      });
      toast({ title: "Wikipedia scan complete", description: summary });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/wikipedia",
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/geo-tools/summary",
      });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to analyze Wikipedia",
        description: err?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  // Header roll-up — single endpoint; the listicle/Wikipedia counts only
  // (BOFU/FAQ/mentions belong to other surfaces now).
  const { data: summaryData } = useQuery<{
    success: boolean;
    data: {
      listicles: { total: number; included: number };
      wikipedia: { existing: number; opportunities: number };
    };
  }>({
    queryKey: ["/api/geo-tools/summary", selectedBrandId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/geo-tools/summary/${selectedBrandId}`);
      return res.json();
    },
    enabled: !!selectedBrandId,
  });
  const summary = summaryData?.data ?? null;

  const updateListicleStatusMutation = useMutation({
    mutationFn: async ({ id, outreachStatus }: { id: string; outreachStatus: string }) => {
      const r = await apiRequest("PATCH", `/api/listicles/${id}`, { outreachStatus });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/listicles",
      });
    },
    onError: () => toast({ title: "Failed to update outreach status", variant: "destructive" }),
  });

  const addListicleMutation = useMutation({
    mutationFn: async (body: {
      brandId: string;
      title: string;
      url: string;
      sourcePublication?: string;
      isIncluded?: number;
      listPosition?: number;
    }) => {
      const r = await apiRequest("POST", "/api/listicles", body);
      const data = await r.json();
      if (!r.ok || data?.success === false) {
        throw new Error(data?.error || "Failed to add listicle");
      }
      return data;
    },
    onSuccess: () => {
      setAddListicleOpen(false);
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/listicles",
      });
      toast({ title: "Listicle added" });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to add listicle",
        description: err?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  const addWikipediaMutation = useMutation({
    mutationFn: async (body: {
      brandId: string;
      pageTitle: string;
      pageUrl: string;
      mentionType: "existing" | "opportunity";
    }) => {
      const r = await apiRequest("POST", "/api/wikipedia", body);
      const data = await r.json();
      if (!r.ok || data?.success === false) {
        throw new Error(data?.error || "Failed to add Wikipedia mention");
      }
      return data;
    },
    onSuccess: () => {
      setAddWikipediaOpen(false);
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/wikipedia",
      });
      toast({ title: "Wikipedia mention added" });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to add Wikipedia mention",
        description: err?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  const draftWikipediaMutation = useMutation({
    mutationFn: async (mentionId: string) => {
      const r = await apiRequest("POST", `/api/wikipedia/draft/${mentionId}`);
      const data = await r.json();
      if (!r.ok || data?.success === false) {
        throw new Error(data?.error || "Draft failed");
      }
      return data;
    },
    onError: (err: any) =>
      toast({
        title: "Failed to draft mention",
        description: err?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  if (!selectedBrandId) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Select a brand to see where it should appear in AI-cited sources but doesn't.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Coverage</h2>
        <p className="text-sm text-muted-foreground">
          Where your brand should appear in AI-cited sources but doesn&apos;t — the &quot;best
          of&quot; listicles AI engines lean on, and relevant Wikipedia pages.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SummaryCard
            label="Listicles"
            primary={`${summary.listicles.included}/${summary.listicles.total}`}
            secondary="In list / tracked"
            testId="summary-listicles"
          />
          <SummaryCard
            label="Wikipedia"
            primary={`${summary.wikipedia.existing}`}
            secondary={`${summary.wikipedia.opportunities} opportunities`}
            testId="summary-wikipedia"
          />
        </div>
      )}

      {/* LISTICLES */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <List className="h-5 w-5 text-chart-5" />
                Listicle Tracker
              </CardTitle>
              <CardDescription>
                Find &quot;best of&quot; articles across consumer, professional, and investor
                audiences where your brand should be listed
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setAddListicleOpen(true)}
                data-testid="button-add-listicle"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add manually
              </Button>
              <Button
                onClick={() => discoverListiclesMutation.mutate()}
                disabled={discoverListiclesMutation.isPending}
                data-testid="button-discover-listicles"
              >
                {discoverListiclesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Discover Opportunities
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-chart-1/10 p-4 rounded-lg mb-6">
            <p className="text-sm text-chart-1">
              <strong>Why Listicles Matter:</strong> Getting included in &quot;Best of&quot;
              articles is how brands rank #1 on ChatGPT. AI systems heavily cite these curated
              lists.
            </p>
          </div>

          {listiclesLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
            </div>
          ) : listiclesIsError ? (
            <ErrorState
              title="Couldn't load listicles"
              onRetry={() => refetchListicles()}
              isRetrying={listiclesIsRefetching}
            />
          ) : listicles.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Tracked Listicles ({listicles.length})</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Filter by outreach</span>
                  <Select value={listicleStatusFilter} onValueChange={setListicleStatusFilter}>
                    <SelectTrigger
                      className="w-[160px] h-8 text-xs"
                      data-testid="select-listicle-status-filter"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="dropped">Dropped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {listicles
                .filter((l) => {
                  if (listicleStatusFilter === "all") return true;
                  const s = (l as any).outreachStatus ?? "new";
                  return s === listicleStatusFilter;
                })
                .map((l, listicleIndex) => {
                  const competitors = Array.isArray(l.competitorsMentioned)
                    ? l.competitorsMentioned
                    : [];
                  const extra = competitors.length > 3 ? competitors.length - 3 : 0;
                  const status = ((l as any).outreachStatus ?? "new") as string;
                  const statusMeta = LISTICLE_STATUS_DISPLAY[status] ?? LISTICLE_STATUS_DISPLAY.new;
                  return (
                    <Card
                      key={l.id}
                      className="border border-border"
                      data-tour-id={listicleIndex === 0 ? "listicles.firstResult" : undefined}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <StatusDot tone="neutral" className="mt-2" />
                          <div className="flex-1 min-w-0">
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-chart-1 hover:underline flex items-center gap-1"
                            >
                              <span className="line-clamp-1">{l.title}</span>
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                            <div className="flex flex-wrap gap-2 mt-2">
                              <Badge
                                className={statusMeta.className}
                                data-testid={`badge-listicle-status-${l.id}`}
                              >
                                {statusMeta.label}
                              </Badge>
                              {l.sourcePublication && (
                                <Badge variant="outline">{l.sourcePublication}</Badge>
                              )}
                              {l.isIncluded === 1 ? (
                                <Badge className="bg-chart-4 hover:bg-chart-4/90">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Included at #{l.listPosition ?? "?"} / {l.totalListItems ?? "?"}
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Not in list
                                </Badge>
                              )}
                              {l.keyword && (
                                <Badge variant="secondary">
                                  <Search className="h-3 w-3 mr-1" />
                                  {l.keyword}
                                </Badge>
                              )}
                            </div>
                            {competitors.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Competitors: {competitors.slice(0, 3).join(", ")}
                                {extra > 0 ? ` + ${extra} more` : ""}
                              </p>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            <Select
                              value={(l as any).outreachStatus ?? "new"}
                              onValueChange={(v) =>
                                updateListicleStatusMutation.mutate({
                                  id: l.id,
                                  outreachStatus: v,
                                })
                              }
                            >
                              <SelectTrigger
                                className="w-[150px] h-8 text-xs"
                                data-testid={`select-listicle-status-${l.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="new">New</SelectItem>
                                <SelectItem value="contacted">Contacted</SelectItem>
                                <SelectItem value="won">Won</SelectItem>
                                <SelectItem value="dropped">Dropped</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          ) : (
            <EmptyState icon={List} title="No listicles yet. Click Discover to scan." />
          )}
        </CardContent>
      </Card>

      {/* WIKIPEDIA */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-chart-1" />
                Wikipedia Monitor
              </CardTitle>
              <CardDescription>
                Track &amp; improve your Wikipedia presence (40% of AI citations)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setAddWikipediaOpen(true)}
                data-testid="button-add-wikipedia"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add manually
              </Button>
              <Button
                onClick={() => scanWikipediaMutation.mutate()}
                disabled={scanWikipediaMutation.isPending}
                data-testid="button-scan-wikipedia"
              >
                {scanWikipediaMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Scan Opportunities
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-chart-3/10 p-4 rounded-lg mb-6">
            <p className="text-sm text-chart-3">
              <strong>Wikipedia = 40% of AI Citations:</strong> It&apos;s the #2 most cited source
              by AI systems after Reddit. Even a mention on a relevant Wikipedia page can
              significantly boost your AI visibility.
            </p>
          </div>

          {wikipediaMentions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                Click &quot;Scan Opportunities&quot; to analyze Wikipedia presence for{" "}
                {selectedBrand?.name}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-chart-4" />
                    You&apos;re already mentioned ({wikiExistingRows.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {wikiExistingRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No existing mentions found on Wikipedia yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {wikiExistingRows.map((m) => {
                        const reason = (m.metadata as { reason?: string } | null)?.reason ?? "";
                        return (
                          <div key={m.id} className="border rounded-md p-3 hover:bg-muted/40">
                            <a
                              href={m.pageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-chart-1 hover:underline flex items-center gap-1"
                            >
                              {m.pageTitle}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            {m.mentionContext && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {m.mentionContext}
                              </p>
                            )}
                            {reason && (
                              <p className="text-xs text-muted-foreground mt-2 italic">{reason}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-4 w-4 text-chart-1" />
                    Pages you could target ({wikiOpportunityRows.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {wikiOpportunityRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No opportunity pages surfaced. Try re-scanning after adding competitors or
                      products to the brand profile.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {wikiOpportunityRows.map((m) => {
                        const reason = (m.metadata as { reason?: string } | null)?.reason ?? "";
                        return (
                          <div key={m.id} className="border rounded-md p-3 hover:bg-muted/40">
                            <div className="flex items-start justify-between gap-2">
                              <a
                                href={m.pageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-chart-1 hover:underline flex items-center gap-1 min-w-0"
                              >
                                <span className="line-clamp-2">{m.pageTitle}</span>
                                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                              </a>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-shrink-0"
                                onClick={async () => {
                                  const data = await draftWikipediaMutation
                                    .mutateAsync(m.id)
                                    .catch(() => null);
                                  if (data?.data) {
                                    setWikiDraft({
                                      mentionId: m.id,
                                      pageTitle: m.pageTitle,
                                      text: data.data.draft || "",
                                      notes: Array.isArray(data.data.notes) ? data.data.notes : [],
                                    });
                                  }
                                }}
                                disabled={draftWikipediaMutation.isPending}
                                data-testid={`button-wikipedia-draft-${m.id}`}
                              >
                                {draftWikipediaMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3 w-3 mr-1" />
                                )}
                                Draft mention
                              </Button>
                            </div>
                            {m.mentionContext && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {m.mentionContext}
                              </p>
                            )}
                            {reason && (
                              <p className="text-xs text-muted-foreground mt-2 italic">{reason}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <ManualAddListicleDialog
        open={addListicleOpen}
        onOpenChange={setAddListicleOpen}
        onSubmit={(payload) =>
          selectedBrandId && addListicleMutation.mutate({ ...payload, brandId: selectedBrandId })
        }
        pending={addListicleMutation.isPending}
      />
      <ManualAddWikipediaDialog
        open={addWikipediaOpen}
        onOpenChange={setAddWikipediaOpen}
        onSubmit={(payload) =>
          selectedBrandId && addWikipediaMutation.mutate({ ...payload, brandId: selectedBrandId })
        }
        pending={addWikipediaMutation.isPending}
      />

      {/* Wikipedia draft viewer — read-only: copy + close. */}
      <Dialog
        open={!!wikiDraft}
        onOpenChange={(o) => {
          if (!o) setWikiDraft(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Draft mention for &quot;{wikiDraft?.pageTitle}&quot;</DialogTitle>
            <DialogDescription>
              NPOV-tuned 2-3 sentence draft you can paste into Wikipedia&apos;s edit form.
            </DialogDescription>
          </DialogHeader>
          {wikiDraft && (
            <div className="space-y-3">
              <div className="border rounded-md p-3 bg-muted/30 whitespace-pre-wrap text-sm">
                {wikiDraft.text}
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                {wikiDraft.notes.map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(wikiDraft.text);
                      toast({ title: "Draft copied" });
                    }
                  }}
                >
                  Copy draft
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setWikiDraft(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Manual-entry dialogs. Each is intentionally minimal — just the
// fields the schema requires + a couple of useful optionals. The
// server validates ownership and returns 409 on a duplicate URL.
// ============================================================

interface ManualAddListicleProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (payload: {
    title: string;
    url: string;
    sourcePublication?: string;
    isIncluded?: number;
    listPosition?: number;
  }) => void;
  pending: boolean;
}

function ManualAddListicleDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: ManualAddListicleProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [sourcePublication, setSourcePublication] = useState("");
  const [included, setIncluded] = useState(false);
  const [listPosition, setListPosition] = useState("");
  const reset = () => {
    setTitle("");
    setUrl("");
    setSourcePublication("");
    setIncluded(false);
    setListPosition("");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a listicle</DialogTitle>
          <DialogDescription>
            Track a &quot;best of&quot; article that the discover scanner missed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="10 Best CRM Tools for Startups in 2025"
              data-testid="input-add-listicle-title"
            />
          </div>
          <div className="space-y-1">
            <Label>URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/best-crm-tools"
              data-testid="input-add-listicle-url"
            />
          </div>
          <div className="space-y-1">
            <Label>Source publication (optional)</Label>
            <Input
              value={sourcePublication}
              onChange={(e) => setSourcePublication(e.target.value)}
              placeholder="example.com"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={included}
              onChange={(e) => setIncluded(e.target.checked)}
              id="manual-listicle-included"
            />
            <Label htmlFor="manual-listicle-included">My brand is included in this list</Label>
          </div>
          {included && (
            <div className="space-y-1">
              <Label>Position (optional)</Label>
              <Input
                type="number"
                min={1}
                value={listPosition}
                onChange={(e) => setListPosition(e.target.value)}
                placeholder="3"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || !url.trim() || pending}
            onClick={() =>
              onSubmit({
                title: title.trim(),
                url: url.trim(),
                sourcePublication: sourcePublication.trim() || undefined,
                isIncluded: included ? 1 : 0,
                listPosition:
                  included && listPosition ? parseInt(listPosition, 10) || undefined : undefined,
              })
            }
            data-testid="button-add-listicle-submit"
          >
            {pending ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ManualAddWikipediaProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (payload: {
    pageTitle: string;
    pageUrl: string;
    mentionType: "existing" | "opportunity";
  }) => void;
  pending: boolean;
}

function ManualAddWikipediaDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: ManualAddWikipediaProps) {
  const [pageTitle, setPageTitle] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [mentionType, setMentionType] = useState<"existing" | "opportunity">("opportunity");
  const reset = () => {
    setPageTitle("");
    setPageUrl("");
    setMentionType("opportunity");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Wikipedia page</DialogTitle>
          <DialogDescription>
            Track an existing mention or a target page where you&apos;d like to be cited.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Page title</Label>
            <Input
              value={pageTitle}
              onChange={(e) => setPageTitle(e.target.value)}
              placeholder="Customer relationship management"
            />
          </div>
          <div className="space-y-1">
            <Label>Page URL</Label>
            <Input
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://en.wikipedia.org/wiki/Customer_relationship_management"
            />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select
              value={mentionType}
              onValueChange={(v: "existing" | "opportunity") => setMentionType(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="existing">Existing mention</SelectItem>
                <SelectItem value="opportunity">Opportunity (not yet mentioned)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!pageTitle.trim() || !pageUrl.trim() || pending}
            onClick={() =>
              onSubmit({
                pageTitle: pageTitle.trim(),
                pageUrl: pageUrl.trim(),
                mentionType,
              })
            }
          >
            {pending ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
