import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NoValue, PanelLabel } from "@/components/dashboard-panels/primitives";
import type { SiteHealth } from "@/components/dashboard-panels/useDashboardData";
import type { SiteHealthFinding } from "@shared/siteHealthFindings";
import type { SiteHealthPage } from "./types";
import { FunnelStatRow, type FunnelStage } from "./FunnelStatRow";
import { ChecksTable } from "./ChecksTable";
import { FindingDrawer } from "./FindingDrawer";

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

/** Left-accent callout for the single highest-point finding. */
function PriorityCallout({ finding, onOpen }: { finding: SiteHealthFinding; onOpen: () => void }) {
  return (
    <div className="border-b border-vc-default px-8 py-6">
      <PanelLabel>Priority finding</PanelLabel>
      <div className="mt-3 flex items-start justify-between gap-4 border-l-2 border-vc-accent pl-4">
        <div className="min-w-0">
          <p className="text-body font-semibold text-vc-primary">
            {finding.affectedUrls.length > 0
              ? `${finding.affectedUrls.length} pages affected. ${finding.title} first, it is the biggest thing holding this site back.`
              : finding.title}
          </p>
          <p className="mt-1 text-data text-vc-secondary">Evidence: {finding.description}</p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded bg-vc-accent-subtle px-3 text-caption font-medium text-vc-accent transition-colors hover:bg-vc-accent hover:text-primary-foreground"
        >
          {finding.advisory ? "How to fix" : "Fix it for me"}
        </button>
      </div>
    </div>
  );
}

type FindingStatus = "in_progress" | "ignored" | "fixed";

interface FindingsTabProps {
  brandId: string;
  health: SiteHealth;
  discovery: SiteHealth["discovery"];
  crawlers: SiteHealth["crawlers"];
  pages: SiteHealthPage[];
  findings: SiteHealthFinding[];
  onOpenPages: (pathPrefix: string) => void;
}

export function FindingsTab({
  brandId,
  health,
  discovery,
  crawlers,
  pages,
  findings,
  onOpenPages,
}: FindingsTabProps) {
  const [funnelStage, setFunnelStage] = useState<FunnelStage | null>(null);
  const [openFinding, setOpenFinding] = useState<SiteHealthFinding | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const statusQuery = useQuery<{
    success: boolean;
    data: { findingId: string; status: FindingStatus }[];
  }>({
    queryKey: [`/api/dashboard/site-health/${brandId}/finding-status`],
    enabled: !!brandId,
  });
  const statusMap = useMemo(() => {
    const map = new Map<string, FindingStatus>();
    for (const row of statusQuery.data?.data ?? []) map.set(row.findingId, row.status);
    return map;
  }, [statusQuery.data]);
  const resolvedCount = useMemo(
    () =>
      findings.filter((f) => {
        const s = statusMap.get(f.id);
        return s === "fixed" || s === "ignored";
      }).length,
    [findings, statusMap],
  );

  // "AI can read" only counts pages whose crawl actually RESOLVED (a real
  // 2xx statusCode) - a page still stuck at statusCode:null/status:"pending"
  // hasn't been measured yet, and factCount:0 on an unresolved row is not
  // the same claim as "confirmed empty" (mirrors pageFindingIds' own
  // statusCode-gated thin-content check in shared/siteHealthFindings.ts -
  // this tile must never disagree with what the checks table says).
  const resolvedPages = pages.filter(
    (p) => p.statusCode !== null && p.statusCode >= 200 && p.statusCode < 300,
  );
  const pagesWithContent = resolvedPages.filter((p) => p.factCount > 0).length;

  // Funnel-tile click filters the checks table to the category that stage
  // actually maps to. Toggling the same stage again clears the filter.
  const stageToCategory: Record<FunnelStage, string> = {
    reach: "CRAWLER ACCESS",
    fetch: "CONTENT QUALITY",
    read: "CONTENT QUALITY",
  };
  const visibleFindings = (
    funnelStage ? findings.filter((f) => f.category === stageToCategory[funnelStage]) : findings
  ).filter((f) => showResolved || !["fixed", "ignored"].includes(statusMap.get(f.id) ?? ""));

  const pageCountForStat = health.crawl?.sitemapUrlCount ?? health.crawl?.pagesCrawled ?? null;

  return (
    <>
      <div className="grid grid-cols-1 border-b border-vc-default sm:grid-cols-2">
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
            health.crawl?.sitemapUrlCount !== null && health.crawl?.pagesCrawled !== null
              ? `${health.crawl?.pagesCrawled} audited`
              : health.crawl?.sitemapUrlCount === null
                ? "Sitemap unavailable - showing audited count"
                : undefined
          }
        />
      </div>

      {findings.length > 0 && (
        <PriorityCallout finding={findings[0]} onOpen={() => setOpenFinding(findings[0])} />
      )}

      <FunnelStatRow
        crawlersTotal={crawlers.total}
        crawlersAllowed={crawlers.allowed}
        crawlersBlocked={crawlers.blocked}
        pagesCrawled={health.crawl?.pagesCrawled ?? null}
        pagesFailed={health.crawl?.pagesFailed ?? null}
        pagesWithContent={resolvedPages.length > 0 ? pagesWithContent : null}
        pagesTotal={resolvedPages.length > 0 ? resolvedPages.length : null}
        activeStage={funnelStage}
        onToggleStage={(s) => setFunnelStage((cur) => (cur === s ? null : s))}
      />

      <div className="grid grid-cols-1 border-b border-vc-default sm:grid-cols-2">
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

      {resolvedCount > 0 && (
        <div className="flex items-center justify-end border-b border-vc-default px-8 py-2">
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className="text-data text-vc-tertiary transition-colors hover:text-vc-primary"
          >
            {showResolved ? "Hide" : "Show"} fixed & ignored ({resolvedCount})
          </button>
        </div>
      )}

      <ChecksTable findings={visibleFindings} score={health.score} onOpenFinding={setOpenFinding} />
      <FindingDrawer
        finding={openFinding}
        onClose={() => setOpenFinding(null)}
        brandId={brandId}
        platform={health.platform}
        currentStatus={openFinding ? (statusMap.get(openFinding.id) ?? null) : null}
        onOpenPages={onOpenPages}
      />
    </>
  );
}
