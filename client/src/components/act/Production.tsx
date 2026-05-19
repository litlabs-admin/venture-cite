import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, FileText, HelpCircle, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { apiRequest } from "@/lib/queryClient";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import BofuContentSheet from "@/components/geo-tools/BofuContentSheet";
import BofuCreatePanel from "@/components/act/BofuCreate";
import FaqPanel from "@/components/act/FaqPanel";
import FaqDetailSheet, { type FaqRow } from "@/components/act/FaqDetailSheet";
import CommunityPanel from "@/components/act/CommunityPanel";
import CommunityDetailSheet, { type CommunityRow } from "@/components/act/CommunityDetailSheet";
import KeywordFinder from "@/components/act/KeywordFinder";
import type { BofuContent } from "@shared/schema";

// ─── Production ──────────────────────────────────────────────────────────────
// /act — the ONE place you produce things that get cited. One status-keyed
// list of EVERYTHING you author (articles, FAQs, community posts, BOFU
// comparisons) + one adaptive "New". The /act rework folded the real tools
// in-context: the orphaned faq-manager / community-engagement /
// keyword-research pages are retired and their capability returns as the
// compact FaqPanel / CommunityPanel / KeywordFinder here. Every row opens
// its item in place — no dead-ends, no page hops, no orphaned destinations.
//
// The four sources are legitimately different tables with incompatible
// native status fields, so unification is at the WORKFLOW layer: aggregate
// the existing GETs, normalise native status → one honest vocabulary
// (Draft → Ready → Published; FAQ is atomic so it maps to Published, with
// isOptimized shown as a quality badge — NOT a fabricated status).

type PStatus = "Draft" | "Ready" | "Published";
type PType = "Article" | "FAQ" | "Community" | "BOFU";

type PItem = {
  id: string;
  type: PType;
  title: string;
  status: PStatus;
  destination: string;
  updatedAt: string | null;
  href: string;
  scorePct: number | null;
  // Non-Article rows have no editor route — carry the source row so a
  // click opens the right in-context sheet instead of navigating.
  bofu?: BofuContent;
  faq?: FaqRow;
  community?: CommunityRow;
};

function pickArray(resp: unknown): any[] {
  if (Array.isArray(resp)) return resp;
  const d = (resp as { data?: unknown } | undefined)?.data;
  if (Array.isArray(d)) return d;
  const rows = (resp as { rows?: unknown } | undefined)?.rows;
  return Array.isArray(rows) ? rows : [];
}

const TYPE_META: Record<PType, { icon: typeof FileText; label: string }> = {
  Article: { icon: FileText, label: "Article" },
  FAQ: { icon: HelpCircle, label: "FAQ" },
  Community: { icon: Users, label: "Community" },
  BOFU: { icon: Wrench, label: "BOFU" },
};

const STATUS_TONE: Record<PStatus, string> = {
  Draft: "text-muted-foreground",
  Ready: "text-[var(--warning)]",
  Published: "text-[var(--positive)]",
};

const STATUS_SEGMENTS: ("All" | PStatus)[] = ["All", "Draft", "Ready", "Published"];
const TYPE_FILTERS: ("All" | PType)[] = ["All", "Article", "FAQ", "Community", "BOFU"];

// Incoming legacy/aliased ?tab → which type the list pre-filters to, so a
// /faq-manager 301, a recommendation CTA, or a Cmd-K entry lands focused.
const TAB_TO_TYPE: Record<string, "All" | PType> = {
  faq: "FAQ",
  community: "Community",
  "geo-assets": "BOFU",
};

export default function Production() {
  const { selectedBrandId } = useBrandSelection();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const enabled = !!selectedBrandId;

  const initialType = TAB_TO_TYPE[new URLSearchParams(search).get("tab") ?? ""] ?? "All";
  const [statusFilter, setStatusFilter] = useState<"All" | PStatus>("All");
  const [typeFilter, setTypeFilter] = useState<"All" | PType>(initialType);

  // The component stays mounted across /act?tab=… changes (every legacy
  // value resolves to the one SpineShell tab), so the useState initializer
  // runs once. Re-focus the type filter when an incoming ?tab maps to a
  // type — that's how a 301 / CTA / Cmd-K "lands focused". Manual clicks
  // don't touch ?tab, so they aren't overridden.
  useEffect(() => {
    const t = TAB_TO_TYPE[new URLSearchParams(search).get("tab") ?? ""];
    if (t) setTypeFilter(t);
  }, [search]);

  const articlesQ = useQuery({
    queryKey: ["/api/articles", "production", selectedBrandId],
    enabled,
    queryFn: async () => (await apiRequest("GET", `/api/articles?limit=200`)).json(),
  });
  const faqsQ = useQuery({
    queryKey: [`/api/faqs?brandId=${selectedBrandId}`],
    enabled,
  });
  const communityQ = useQuery({
    queryKey: ["/api/community-posts", selectedBrandId],
    enabled,
    queryFn: async () =>
      (await apiRequest("GET", `/api/community-posts?brandId=${selectedBrandId}`)).json(),
  });
  const bofuQ = useQuery({
    queryKey: ["/api/bofu-content", selectedBrandId],
    enabled,
    queryFn: async () =>
      (await apiRequest("GET", `/api/bofu-content?brandId=${selectedBrandId}`)).json(),
  });

  const items = useMemo<PItem[]>(() => {
    const out: PItem[] = [];

    for (const a of pickArray(articlesQ.data)) {
      const s: string = a.status ?? "draft";
      const status: PStatus = a.externalUrl ? "Published" : s === "ready" ? "Ready" : "Draft";
      out.push({
        id: String(a.id),
        type: "Article",
        title: a.title || "Untitled article",
        status,
        destination: a.externalUrl ? "Your site" : "—",
        updatedAt: a.updatedAt ?? a.createdAt ?? null,
        href: `/content/${a.id}`,
        scorePct: null,
      });
    }

    for (const f of pickArray(faqsQ.data)) {
      // FAQ is atomic — live in your knowledge base the moment it exists.
      // No draft/published lifecycle; isOptimized is quality, shown in the
      // detail sheet.
      out.push({
        id: String(f.id),
        type: "FAQ",
        title: f.question || "Untitled FAQ",
        status: "Published",
        destination: "FAQ knowledge base",
        updatedAt: f.updatedAt ?? f.createdAt ?? null,
        href: "",
        scorePct: typeof f.aiSurfaceScore === "number" ? f.aiSurfaceScore : null,
        faq: {
          id: String(f.id),
          question: f.question ?? "",
          answer: f.answer ?? "",
          category: f.category ?? null,
          aiSurfaceScore: typeof f.aiSurfaceScore === "number" ? f.aiSurfaceScore : null,
          isOptimized: typeof f.isOptimized === "number" ? f.isOptimized : null,
          optimizationTips: Array.isArray(f.optimizationTips) ? f.optimizationTips : null,
        },
      });
    }

    for (const c of pickArray(communityQ.data)) {
      const s: string = c.status ?? "draft";
      if (s === "archived") continue;
      const status: PStatus = s === "posted" ? "Published" : s === "ready" ? "Ready" : "Draft";
      out.push({
        id: String(c.id),
        type: "Community",
        title: c.title || c.groupName || "Community post",
        status,
        destination: c.platform || c.groupName || "Community",
        updatedAt: c.postedAt ?? c.createdAt ?? null,
        href: "",
        scorePct: null,
        community: {
          id: String(c.id),
          title: c.title ?? null,
          content: c.content ?? null,
          platform: c.platform ?? null,
          groupName: c.groupName ?? null,
          status: c.status ?? null,
          postUrl: c.postUrl ?? null,
          postedAt: c.postedAt ?? null,
        },
      });
    }

    for (const b of pickArray(bofuQ.data)) {
      out.push({
        id: String(b.id),
        type: "BOFU",
        title: b.title || "BOFU comparison",
        status: b.publishedUrl ? "Published" : "Draft",
        destination: "Comparison page",
        updatedAt: b.updatedAt ?? b.createdAt ?? null,
        href: "",
        scorePct: null,
        bofu: b as BofuContent,
      });
    }

    return out.sort(
      (x, y) => new Date(y.updatedAt ?? 0).getTime() - new Date(x.updatedAt ?? 0).getTime(),
    );
  }, [articlesQ.data, faqsQ.data, communityQ.data, bofuQ.data]);

  const visible = items.filter(
    (it) =>
      (statusFilter === "All" || it.status === statusFilter) &&
      (typeFilter === "All" || it.type === typeFilter),
  );
  // First FAQ / Article row carries the relocated tour targets (the
  // faq-manager + articles pages that used to own them are retired).
  // Literal declarations for the static tour verifier:
  //   data-tour-id="faq.firstResult"
  //   data-tour-id="articles.firstResult"
  const firstFaqId = visible.find((it) => it.type === "FAQ")?.id ?? null;
  const firstArticleId = visible.find((it) => it.type === "Article")?.id ?? null;

  const loading = articlesQ.isLoading || faqsQ.isLoading || communityQ.isLoading || bofuQ.isLoading;

  // The 4b hallucination-correction "Open in FAQ" deep-link
  // (/faq-manager?faqSeed… → 301 → /act?tab=faq&faqSeed…) used to land
  // directly on a prefilled form. Auto-open the create dialog on FAQ so
  // that propose-don't-execute flow still arrives ready to review.
  const hasFaqSeed = useMemo(() => {
    const p = new URLSearchParams(search);
    return !!(p.get("faqSeedQuestion") || p.get("faqSeedAnswer"));
  }, [search]);
  const [createOpen, setCreateOpen] = useState(hasFaqSeed);
  const [createType, setCreateType] = useState<PType>("FAQ");
  useEffect(() => {
    if (hasFaqSeed) {
      setCreateType("FAQ");
      setCreateOpen(true);
    }
  }, [hasFaqSeed]);
  const [activeBofu, setActiveBofu] = useState<BofuContent | null>(null);
  const [bofuSheetOpen, setBofuSheetOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<FaqRow | null>(null);
  const [faqSheetOpen, setFaqSheetOpen] = useState(false);
  const [activeCommunity, setActiveCommunity] = useState<CommunityRow | null>(null);
  const [communitySheetOpen, setCommunitySheetOpen] = useState(false);
  const [keywordOpen, setKeywordOpen] = useState(false);

  function openItem(it: PItem) {
    if (it.type === "Article") {
      setLocation(it.href);
    } else if (it.type === "BOFU" && it.bofu) {
      setActiveBofu(it.bofu);
      setBofuSheetOpen(true);
    } else if (it.type === "FAQ" && it.faq) {
      setActiveFaq(it.faq);
      setFaqSheetOpen(true);
    } else if (it.type === "Community" && it.community) {
      setActiveCommunity(it.community);
      setCommunitySheetOpen(true);
    }
  }

  // Article is a genuine document — it opens the real editor. (FAQ /
  // Community / BOFU complete in-context; nothing hands off to an
  // orphaned page anymore.)
  function newArticle() {
    const b = selectedBrandId ? `?brandId=${encodeURIComponent(selectedBrandId)}` : "";
    setCreateOpen(false);
    setLocation(`/content${b}`);
  }

  if (!selectedBrandId) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Select a brand to see and produce its content.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* One aligned toolbar: filters (compact dropdowns) on the left,
          the two entry points on the right. No title/subtitle — the
          AppShell context bar already names the surface. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "All" | PStatus)}>
            <SelectTrigger className="h-9 w-[140px]" data-testid="production-status-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_SEGMENTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "All" ? "All statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "All" | PType)}>
            <SelectTrigger className="h-9 w-[140px]" data-testid="production-type-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTERS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === "All" ? "All types" : t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setKeywordOpen(true)}
            data-testid="production-find-keywords"
          >
            <Search className="mr-1.5 h-4 w-4" />
            Find keywords
          </Button>
          <Button onClick={() => setCreateOpen(true)} data-testid="production-new">
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-foreground">Nothing here yet.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Use “New” to produce your first {typeFilter === "All" ? "" : typeFilter + " "}item.
            </p>
          </div>
        ) : (
          <ul>
            {visible.map((it) => {
              const I = TYPE_META[it.type].icon;
              return (
                <li
                  key={`${it.type}:${it.id}`}
                  className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0"
                >
                  <I className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <button
                    type="button"
                    onClick={() => openItem(it)}
                    className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`production-row-${it.type.toLowerCase()}-${it.id}`}
                    data-tour-id={
                      it.type === "FAQ" && it.id === firstFaqId
                        ? "faq.firstResult"
                        : it.type === "Article" && it.id === firstArticleId
                          ? "articles.firstResult"
                          : undefined
                    }
                  >
                    <p className="truncate text-sm font-medium text-foreground">{it.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {TYPE_META[it.type].label} · {it.destination}
                      {it.updatedAt ? ` · ${formatRelativeTime(it.updatedAt)}` : ""}
                    </p>
                  </button>
                  {it.scorePct !== null && (
                    <span className="tnum hidden text-xs text-muted-foreground sm:inline">
                      {it.scorePct}%
                    </span>
                  )}
                  <span className={`text-xs font-medium ${STATUS_TONE[it.status]}`}>
                    {it.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {(Object.keys(TYPE_META) as PType[]).map((t) => {
              const I = TYPE_META[t].icon;
              const on = t === createType;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCreateType(t)}
                  data-testid={`production-new-${t.toLowerCase()}`}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <I className="h-4 w-4" />
                  {TYPE_META[t].label}
                </button>
              );
            })}
          </div>
          {createType === "FAQ" ? (
            <FaqPanel brandId={selectedBrandId} onCreated={() => setCreateOpen(false)} />
          ) : createType === "Community" ? (
            <CommunityPanel brandId={selectedBrandId} onCreated={() => setCreateOpen(false)} />
          ) : createType === "BOFU" ? (
            <BofuCreatePanel brandId={selectedBrandId} onCreated={() => setCreateOpen(false)} />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>New article</DialogTitle>
                <DialogDescription>
                  An article is a document — you’ll draft, generate, and edit it in the editor.
                </DialogDescription>
              </DialogHeader>
              <Button className="w-full" onClick={newArticle} data-testid="prod-handoff">
                Open the editor →
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <BofuContentSheet
        content={activeBofu}
        open={bofuSheetOpen}
        onOpenChange={(o) => {
          setBofuSheetOpen(o);
          if (!o) setActiveBofu(null);
        }}
      />
      <FaqDetailSheet
        faq={activeFaq}
        brandId={selectedBrandId}
        open={faqSheetOpen}
        onOpenChange={(o) => {
          setFaqSheetOpen(o);
          if (!o) setActiveFaq(null);
        }}
      />
      <CommunityDetailSheet
        post={activeCommunity}
        open={communitySheetOpen}
        onOpenChange={(o) => {
          setCommunitySheetOpen(o);
          if (!o) setActiveCommunity(null);
        }}
      />
      <KeywordFinder open={keywordOpen} onOpenChange={setKeywordOpen} />
    </div>
  );
}
