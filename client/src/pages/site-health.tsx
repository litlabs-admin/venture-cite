import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Download } from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { CCLink, DEST } from "@/components/dashboard-panels/primitives";
import type { SiteHealth } from "@/components/dashboard-panels/useDashboardData";
import { computeSiteHealthFindings, type SiteHealthFinding } from "@shared/siteHealthFindings";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { SiteHealthPage } from "@/components/site-health/types";
import { FindingsTab } from "@/components/site-health/FindingsTab";
import { PagesTab } from "@/components/site-health/PagesTab";
import { HistoryTab } from "@/components/site-health/HistoryTab";

// ─── Site Health detail ──────────────────────────────────────────────────────
// Destination of the dashboard's Site Health panel's "Optimize ›" link.
// Full rebuild against trakkr.ai/optimize (see the published teardown
// artifact this session) - Findings / Pages / History tabs, a shared
// finding drawer, and real scan history (migration 0094). Every tile that
// has no real data source in this codebase still renders honestly (NoValue
// / "not measured yet"), never a fabricated number - see the per-component
// comments for exactly which pieces that applies to and why.

function csvEscape(v: string | number | null | undefined) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function relTime(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function SiteHealthDetailPage() {
  const { brands, selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const [tab, setTab] = useState("findings");
  // Set by FindingsTab's "Open these pages" link, so switching to Pages
  // lands pre-filtered to the finding's path group instead of the full list.
  const [pagesInitialSearch, setPagesInitialSearch] = useState("");

  const healthQuery = useQuery<{ success: boolean; data: SiteHealth }>({
    queryKey: [`/api/dashboard/site-health/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });
  const pagesQuery = useQuery<{
    success: boolean;
    data: { runId: string | null; pages: SiteHealthPage[] };
  }>({
    queryKey: [`/api/dashboard/site-health/${selectedBrandId}/pages`],
    enabled: !!selectedBrandId,
  });
  // Per-page CONTENT findings (meta tags, OG tags, headings, readability,
  // structured answer formats, FAQ content, content density). Separate
  // query from `health`/`pages` above - it re-fetches page HTML server-side
  // and is cached 6h, so it must never block the main render.
  const contentFindingsQuery = useQuery<{
    success: boolean;
    data: { findings: SiteHealthFinding[] };
  }>({
    queryKey: [`/api/dashboard/site-health/${selectedBrandId}/content-findings`],
    enabled: !!selectedBrandId,
  });

  const brand = brands.find((b) => b.id === selectedBrandId) ?? null;
  const health = healthQuery.data?.data ?? null;

  // NORMALISE BEFORE READING. Same defensive shape as the dashboard's
  // SiteHealthPanel - a payload missing a nested object must not throw.
  const discovery = health?.discovery ?? {
    robotsTxt: null,
    sitemapXml: null,
    llmsTxt: null,
    mcpJson: null,
    securityTxt: null,
  };
  const crawlers = health?.crawlers ?? {
    total: 0,
    allowed: 0,
    blocked: 0,
    unknown: 0,
    blockedCrawlers: [],
  };
  const crawl = health?.crawl ?? {
    pagesCrawled: null,
    pagesFailed: null,
    sitemapUrlCount: null,
    lastCrawlAt: null,
  };
  const pages = pagesQuery.data?.data?.pages ?? [];

  const loading = brandsLoading || healthQuery.isLoading;
  const neverCrawled = !!health && crawl.pagesCrawled === null;

  // Content findings load independently (separate cached endpoint) and are
  // always 0-pt/advisory, so appending them never changes point-sorted
  // order - they simply extend the checks table.
  const contentFindings = contentFindingsQuery.data?.data?.findings ?? [];
  const findings = [
    ...computeSiteHealthFindings({ crawl, discovery, crawlers }, pages),
    ...contentFindings,
  ];

  function exportCsv() {
    const rows: (string | number | null)[][] = [
      ["VentureCite - Site Health export"],
      ["Brand", brand?.name ?? ""],
      ["Website", health?.website ?? ""],
      ["Generated", new Date().toISOString()],
      [],
      ["Findings"],
      ["Category", "Title", "Points", "Advisory", "Affected URLs"],
      ...findings.map((f) => [
        f.category,
        f.title,
        f.points,
        f.advisory ? "yes" : "no",
        f.affectedUrls.join(" | "),
      ]),
      [],
      ["Pages"],
      ["URL", "Status", "Severity", "Fact count"],
      ...pages.map((p) => [p.url, p.statusCode ?? p.errorKind ?? "", p.severity, p.factCount]),
    ];
    const body = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `venturecite-site-health-${(brand?.name ?? "brand").replace(/\W+/g, "-").toLowerCase()}-${stamp}.csv`,
      body,
    );
  }

  return (
    <div className="min-h-screen bg-vc-page">
      {/* Header: brand name · website ↗ · ● Audited <relative time> */}
      <div className="flex items-center justify-between border-b border-vc-default px-8 py-6">
        <div>
          <h1 className="text-page font-semibold text-vc-primary">
            {brand?.name ?? "Site Health"}
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-data text-vc-tertiary">
            {health?.website && (
              <>
                <a
                  href={health.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 hover:text-vc-accent"
                >
                  {health.website.replace(/^https?:\/\//, "")}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
                <span aria-hidden>·</span>
              </>
            )}
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{
                backgroundColor: health?.checkedAt ? "var(--brand-accent)" : "var(--border-strong)",
              }}
              aria-hidden
            />
            {health?.checkedAt ? `Audited ${relTime(health.checkedAt)}` : "Not audited yet"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!health}
            className="flex h-8 items-center gap-1.5 rounded border border-vc-default px-2.5 text-caption font-medium text-vc-secondary transition-colors duration-150 hover:bg-vc-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export
          </button>
          <CCLink
            dest={DEST.crawler}
            className="text-label text-vc-label transition-colors hover:text-vc-accent"
          >
            Crawler access
          </CCLink>
        </div>
      </div>

      {loading ? (
        <div className="space-y-px">
          <div className="h-24 w-full animate-pulse bg-vc-muted/40" />
          <div className="h-20 w-full animate-pulse bg-vc-muted/40" />
        </div>
      ) : !health || !health.website ? (
        <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
          <p className="mb-1 text-body text-vc-tertiary">No website on this brand</p>
          <p className="text-data text-vc-tertiary/80">
            Add a website to your brand to run a site health audit.
          </p>
        </div>
      ) : health.pending ? (
        // Compute hasn't finished within the server's deadline - a timeout is
        // not a measurement. Never render a score/zeroes here; the background
        // compute keeps running and the next load gets the real answer.
        <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
          <p className="mb-1 text-body text-vc-tertiary">Measuring…</p>
          <p className="text-data text-vc-tertiary/80">
            Auditing this site is taking longer than usual - refresh in a few seconds.
          </p>
        </div>
      ) : neverCrawled ? (
        <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
          <p className="mb-1 text-body text-vc-tertiary">Not crawled yet</p>
          <p className="text-data text-vc-tertiary/80">
            Run a crawl to see findings and pages here.
          </p>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="border-b border-vc-default px-8 py-3">
            <TabsList>
              <TabsTrigger value="findings">Findings</TabsTrigger>
              <TabsTrigger value="pages">Pages</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="findings" className="mt-0">
            {selectedBrandId && (
              <FindingsTab
                brandId={selectedBrandId}
                health={health}
                discovery={discovery}
                crawlers={crawlers}
                pages={pages}
                findings={findings}
                onOpenPages={(pathPrefix) => {
                  setPagesInitialSearch(pathPrefix.replace(/\/\*$/, ""));
                  setTab("pages");
                }}
              />
            )}
          </TabsContent>
          <TabsContent value="pages" className="mt-0">
            <PagesTab health={health} pages={pages} initialSearch={pagesInitialSearch} />
          </TabsContent>
          <TabsContent value="history" className="mt-0">
            {selectedBrandId && <HistoryTab brandId={selectedBrandId} />}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export type { SiteHealthPage };
