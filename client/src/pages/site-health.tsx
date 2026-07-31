import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Download } from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import {
  PanelLabel,
  NoValue,
  CCLink,
  DEST,
  type Dest,
} from "@/components/dashboard-panels/primitives";
import type { SiteHealth } from "@/components/dashboard-panels/useDashboardData";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  computeSiteHealthFindings,
  type SiteHealthFinding,
  type SiteHealthFindingCategory,
} from "@shared/siteHealthFindings";

// ─── Site Health detail ──────────────────────────────────────────────────────
// Destination of the dashboard's Site Health panel's "Optimize ›" link.
// Reference structure (measured from trakkr.ai/optimize):
//
//   Header:    brand name · "Audited <relative time>"
//   Stat row:  CITATION READINESS (n/100) · PAGES CRAWLED · OPEN ISSUES ·
//              CRAWL → CITE RATE
//   Meta row:  PLATFORM · DISCOVERY (robots.txt / sitemap.xml / llms.txt) ·
//              CRAWLERS (Allowed/Blocked)
//   Body:      issues grouped by severity, each listing the affected page
//              URLs
//
// HONESTY: this page has no data source for "crawl → cite rate" - no join
// exists between fact-scrape pages and which prompts cited them - so that
// stat renders as unmeasured, exactly like the dashboard's AI Traffic tile,
// never a fabricated ratio.
//
// Every nested field is defaulted before being read: a payload missing
// `discovery`/`crawlers`/`crawl` must render the page, not throw - this is
// the same bug class the dashboard's SiteHealthPanel regression-guards
// against (tests/unit/siteHealthPanel.test.tsx).

export interface SiteHealthPage {
  url: string;
  statusCode: number | null;
  status: string;
  errorKind: string | null;
  contentType: string | null;
  factCount: number;
  severity: "critical" | "high" | "medium" | "low" | "ok";
}

const SEVERITY_SWATCH: Record<string, string> = {
  critical: "var(--negative)",
  high: "var(--brand-accent)",
  medium: "var(--fg-disabled)",
  low: "var(--border-strong)",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

// Which existing route best addresses a finding's category. Only real
// destinations from primitives.tsx's DEST map - a category with no good fit
// (CONTENT STRUCTURE's advisory findings) gets no link rather than a fake one.
const CATEGORY_DEST: Partial<Record<SiteHealthFindingCategory, Dest>> = {
  DISCOVERABILITY: DEST.crawler,
  "CRAWLER ACCESS": DEST.crawler,
  "CONTENT QUALITY": DEST.signals,
};

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

function StatTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-6 py-5">
      <PanelLabel>{label}</PanelLabel>
      <span className="text-metric font-semibold tabular-nums text-vc-primary">{value}</span>
      {caption && <span className="text-data text-vc-tertiary">{caption}</span>}
    </div>
  );
}

function MetaTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-6 py-4">
      <PanelLabel>{label}</PanelLabel>
      {children}
    </div>
  );
}

// Tri-state: true = confirmed present (accent dot), false = confirmed
// absent (grey dot, same as before), null = UNKNOWN - a distinct dash/muted
// treatment, deliberately NOT the same look as "absent". A file we never
// got an answer for (timeout / 429 / network error) is not the same claim
// as a file we confirmed missing.
function DiscoveryRow({ label, status }: { label: string; status: boolean | null }) {
  if (status === null || status === undefined) {
    return (
      <div className="flex items-center gap-1.5 text-data text-vc-tertiary/70">
        <span className="w-1.5 flex-shrink-0 text-center leading-none" aria-hidden>
          –
        </span>
        {label}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-data text-vc-secondary">
      <span
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: status ? "var(--brand-accent)" : "var(--border-strong)" }}
        aria-hidden
      />
      {label}
    </div>
  );
}

function IssueGroup({
  severity,
  pages,
}: {
  severity: (typeof SEVERITY_ORDER)[number];
  pages: SiteHealthPage[];
}) {
  if (pages.length === 0) return null;
  return (
    <div className="border-b border-vc-default px-8 py-5">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-2 w-2 flex-shrink-0"
          style={{ backgroundColor: SEVERITY_SWATCH[severity] }}
          aria-hidden
        />
        <span className="text-caption font-semibold text-vc-primary">
          {SEVERITY_LABEL[severity]}
        </span>
        <span className="text-data tabular-nums text-vc-tertiary">({pages.length})</span>
      </div>
      <ul className="space-y-1.5">
        {pages.map((p) => (
          <li key={p.url} className="flex items-center gap-2 text-data">
            <span className="min-w-0 flex-1 truncate text-vc-secondary" title={p.url}>
              {p.url}
            </span>
            <span className="flex-shrink-0 tabular-nums text-vc-tertiary">
              {p.statusCode ?? p.errorKind ?? "-"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Left-accent callout for the single highest-point finding - the one thing
 *  worth fixing before anything else. */
function TopPriority({ finding }: { finding: SiteHealthFinding }) {
  const dest = CATEGORY_DEST[finding.category];
  return (
    <div className="border-b border-vc-default px-8 py-6">
      <PanelLabel>Top Priority</PanelLabel>
      <div className="mt-3 border-l-2 border-vc-accent pl-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-body font-semibold text-vc-primary">{finding.title}</p>
          {!finding.advisory && (
            <span className="flex-shrink-0 text-data font-semibold tabular-nums text-vc-accent">
              +{finding.points} pts
            </span>
          )}
        </div>
        <p className="mt-1 text-data text-vc-secondary">{finding.description}</p>
        {finding.affectedUrls.length > 0 && (
          <p className="mt-1 text-label text-vc-tertiary">
            {finding.affectedUrls.length} affected page
            {finding.affectedUrls.length === 1 ? "" : "s"}
          </p>
        )}
        {dest && (
          <CCLink
            dest={dest}
            className="mt-2 inline-flex items-center gap-1 text-label font-medium text-vc-accent hover:underline"
          >
            Fix this →
          </CCLink>
        )}
      </div>
    </div>
  );
}

/** Remaining findings, each with an eyebrow category, affected-path preview,
 *  and a bar sized relative to the top (highest-point) finding - so the row
 *  widths communicate "how much this matters next to the biggest issue"
 *  rather than an absolute, uncalibrated percentage. */
function WhatToFixNext({
  findings,
  maxPoints,
}: {
  findings: SiteHealthFinding[];
  maxPoints: number;
}) {
  return (
    <div className="border-b border-vc-default px-8 py-6">
      <PanelLabel>What To Fix Next</PanelLabel>
      <ul className="mt-3 space-y-4">
        {findings.map((f) => {
          const shown = f.affectedUrls.slice(0, 3);
          const more = f.affectedUrls.length - shown.length;
          const pct = maxPoints > 0 ? Math.max(4, Math.round((f.points / maxPoints) * 100)) : 0;
          return (
            <li key={f.id}>
              <div className="flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
                    {f.category}
                  </span>
                  <p className="text-caption text-vc-primary">{f.title}</p>
                </div>
                <span className="flex-shrink-0 text-data tabular-nums text-vc-tertiary">
                  {f.advisory ? "advisory" : `+${f.points} pts`}
                </span>
              </div>
              {shown.length > 0 && (
                <p
                  className="mt-1 truncate text-data text-vc-tertiary"
                  title={f.affectedUrls.join(", ")}
                >
                  {shown.join(", ")}
                  {more > 0 ? ` +${more} more` : ""}
                </p>
              )}
              {!f.advisory && (
                <div className="mt-1.5 h-1 w-full max-w-xs bg-vc-muted" aria-hidden>
                  <div className="h-full bg-vc-accent/70" style={{ width: `${pct}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function VerifyWithRealBotData() {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-vc-default bg-vc-muted/30 px-8 py-5">
      <p className="text-data text-vc-tertiary">
        Measure what AI bots actually do, not just what they should see.
      </p>
      <CCLink
        dest={DEST.crawler}
        className="flex-shrink-0 text-label font-medium text-vc-accent hover:underline"
      >
        Verify with real bot data →
      </CCLink>
    </div>
  );
}

export default function SiteHealthDetailPage() {
  const { brands, selectedBrandId, isLoading: brandsLoading } = useBrandSelection();

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
  // "Pages" stat prefers the sitemap's URL count (the SITE's size) and falls
  // back to the audited count only when the sitemap is unavailable - see
  // docs/optimize-perception-reference.md for why these are different
  // numbers and must not be conflated.
  const pageCountForStat = crawl.sitemapUrlCount ?? crawl.pagesCrawled;
  const issues = health?.issues ?? { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  const pages = pagesQuery.data?.data?.pages ?? [];

  const loading = brandsLoading || healthQuery.isLoading;
  const neverCrawled = !!health && crawl.pagesCrawled === null;

  // Content findings load independently (separate cached endpoint) and are
  // always 0-pt/advisory, so appending them never changes point-sorted
  // order - they simply extend the "What To Fix Next" list.
  const contentFindings = contentFindingsQuery.data?.data?.findings ?? [];
  const findings = [
    ...computeSiteHealthFindings({ crawl, discovery, crawlers }, pages),
    ...contentFindings,
  ];
  const maxPoints = findings.length > 0 ? findings[0].points : 0;

  function exportCsv() {
    const rows: (string | number | null)[][] = [
      ["VentureCite - Site Health export"],
      ["Brand", brand?.name ?? ""],
      ["Website", health?.website ?? ""],
      ["Generated", new Date().toISOString()],
      [],
      ["Citation readiness", health?.score ?? ""],
      ["Pages", pageCountForStat ?? ""],
      ["Open issues", neverCrawled ? "" : issues.total],
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

  const pagesBySeverity = SEVERITY_ORDER.reduce(
    (acc, sev) => {
      acc[sev] = pages.filter((p) => p.severity === sev);
      return acc;
    },
    {} as Record<(typeof SEVERITY_ORDER)[number], SiteHealthPage[]>,
  );

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

      {/* Tab strip: only Findings is implemented; Pages/Issues are disabled
          with real badge counts - a control that goes nowhere is worse than
          no control, so these stay disabled rather than faked as clickable. */}
      {!loading && health?.website && (
        <div className="border-b border-vc-default px-8 py-3">
          <Tabs value="findings">
            <TabsList>
              <TabsTrigger value="findings">Findings</TabsTrigger>
              <TabsTrigger value="pages" disabled>
                Pages{pageCountForStat !== null ? ` (${pageCountForStat})` : ""}
              </TabsTrigger>
              <TabsTrigger value="issues" disabled>
                Issues{!neverCrawled ? ` (${issues.total})` : ""}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

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
      ) : (
        <>
          {/* Stat row */}
          <div className="grid grid-cols-1 border-b border-vc-default sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Citation Readiness"
              value={
                health.score !== null ? (
                  <>
                    {health.score}
                    <span className="text-body font-normal text-vc-tertiary">/100</span>
                  </>
                ) : (
                  <NoValue className="text-metric font-semibold" />
                )
              }
            />
            <StatTile
              label="Pages"
              value={
                pageCountForStat !== null ? (
                  pageCountForStat
                ) : (
                  <NoValue className="text-metric font-semibold" />
                )
              }
              caption={
                crawl.sitemapUrlCount !== null && crawl.pagesCrawled !== null
                  ? `${crawl.pagesCrawled} audited`
                  : crawl.sitemapUrlCount === null
                    ? "Sitemap unavailable - showing audited count"
                    : undefined
              }
            />
            <StatTile
              label="Open Issues"
              value={
                neverCrawled ? <NoValue className="text-metric font-semibold" /> : issues.total
              }
            />
            {/* No data source joins fact-scrape pages to which prompts cited
                them, so this stat is genuinely unmeasured - same treatment
                as the dashboard's AI Traffic tile. */}
            <StatTile
              label="Crawl → Cite Rate"
              value={<NoValue className="text-metric font-semibold" />}
              caption="No data source yet - requires linking crawled pages to citation results."
            />
          </div>

          {/* Meta row */}
          <div className="grid grid-cols-1 border-b border-vc-default sm:grid-cols-3">
            <MetaTile label="Platform">
              <span className="text-caption text-vc-secondary">
                {health.platform ?? <NoValue className="text-caption" />}
              </span>
            </MetaTile>
            <MetaTile label="Discovery">
              <div className="flex flex-col gap-1">
                <DiscoveryRow label="robots.txt" status={discovery.robotsTxt} />
                <DiscoveryRow label="sitemap.xml" status={discovery.sitemapXml} />
                <DiscoveryRow label="llms.txt" status={discovery.llmsTxt} />
              </div>
            </MetaTile>
            <MetaTile label="Crawlers">
              <span className="text-caption text-vc-secondary">
                {crawlers.total > 0 ? (
                  <>
                    <span className="tabular-nums">{crawlers.allowed}</span> allowed ·{" "}
                    <span className="tabular-nums">{crawlers.blocked}</span> blocked
                  </>
                ) : (
                  <NoValue className="text-caption" />
                )}
              </span>
            </MetaTile>
          </div>

          {/* Top priority + What to fix next, derived from the same pure
              findings module the /api layer could expose - see
              shared/siteHealthFindings.ts. Nothing renders when there's no
              crawl or nothing to fix. */}
          {findings.length > 0 && (
            <>
              <TopPriority finding={findings[0]} />
              {findings.length > 1 && (
                <WhatToFixNext findings={findings.slice(1)} maxPoints={maxPoints} />
              )}
            </>
          )}

          <VerifyWithRealBotData />

          {/* Body: issues grouped by severity, listing affected page URLs */}
          {neverCrawled ? (
            <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
              <p className="mb-1 text-body text-vc-tertiary">Not crawled yet</p>
              <p className="text-data text-vc-tertiary/80">
                Run a crawl to see per-page issues here.
              </p>
            </div>
          ) : pages.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
              <p className="text-body text-vc-tertiary">No pages recorded for the latest crawl.</p>
            </div>
          ) : issues.total === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
              <p className="text-body text-vc-tertiary">No issues found in the last crawl.</p>
            </div>
          ) : (
            <div>
              {SEVERITY_ORDER.map((sev) => (
                <IssueGroup key={sev} severity={sev} pages={pagesBySeverity[sev]} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
