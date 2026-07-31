// Admin-only fact-sheet scrape inspector.
//
// Renders the full picture of a single scrape run: the events timeline,
// per-page outcomes, per-source aggregate logs, and the surviving facts
// with their full provenance.
//
// Operators use this to answer "why did this brand's last scrape
// produce only 3 facts" or "what happened to Adyen's run last night"
// without attaching a debugger or grepping logs.
//
// Gated to admin users via the server route's `isAdmin` middleware.
// We additionally hide the page link from non-admin sidebars but
// don't rely on that for security.

import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  XCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { safeExternalHref } from "@/lib/urlSafety";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";
import { NoValue } from "@/components/dashboard-panels/primitives";

type Event = {
  id: string;
  runId: string;
  brandId: string;
  stepName: string;
  outcome: "ok" | "skipped" | "failed";
  durationMs: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type Page = {
  id: string;
  url: string;
  canonicalUrl: string | null;
  status: string | null;
  statusCode: number | null;
  factCount: number | null;
  errorKind: string | null;
  errorMessage: string | null;
};

type Run = {
  id: string;
  brandId: string;
  status: string;
  triggeredBy: string | null;
  errorKind: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  pagesPlanned: number | null;
  pagesFetched: number | null;
  factsExtracted: number | null;
  llmCostCents: number | null;
};

type Brand = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
};

type Totals = {
  pages: number;
  pagesOk: number;
  pagesSkipped: number;
  pagesFailed: number;
  events: number;
  eventsFailed: number;
  facts: number;
  factsScraped: number;
  factsUser: number;
};

type InspectorResponse = {
  success: true;
  data: {
    run: Run;
    brand: Brand | null;
    pages: Page[];
    logs: Array<{
      id: string;
      source: string;
      status: string;
      factCount: number | null;
      latencyMs: number | null;
      errorKind: string | null;
      diagnostics: Record<string, unknown> | null;
    }>;
    events: Event[];
    facts: Array<{
      id: string;
      domain: string;
      subcategory: string;
      factKey: string;
      factValue: string;
      source: string;
      sourceUrl: string | null;
    }>;
    totals: Totals;
  };
};

// Neutral, token-based category colours - no chart-4 (data-viz only) and
// no --positive (data-viz only, not status/chip use per the colour-system
// decision) standing in for "this step went fine".
const STEP_COLORS: Record<string, string> = {
  sitemap_discovery: "bg-primary/10 text-primary",
  page_extract: "bg-secondary text-secondary-foreground",
  terminal: "bg-accent text-accent-foreground",
  unknown: "bg-muted text-muted-foreground",
};

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function OutcomeIcon({ outcome }: { outcome: "ok" | "skipped" | "failed" }) {
  if (outcome === "ok") return <CheckCircle className="h-3.5 w-3.5 text-vc-primary" />;
  if (outcome === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <ChevronRight className="h-3.5 w-3.5 text-vc-tertiary" />;
}

function EventCard({ event }: { event: Event }) {
  const [open, setOpen] = useState(false);
  const colorClass = STEP_COLORS[event.stepName] ?? STEP_COLORS.unknown;
  return (
    <div className="border-b border-vc-default py-3 text-caption last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <div className="flex items-start gap-2 min-w-0">
          <OutcomeIcon outcome={event.outcome} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge className={cn("font-mono text-label", colorClass)}>{event.stepName}</Badge>
              <span className="text-caption text-vc-tertiary tabular-nums">
                {fmtDuration(event.durationMs)}
              </span>
              <span className="text-label text-vc-tertiary tabular-nums">
                {new Date(event.createdAt).toISOString().slice(11, 23)}
              </span>
            </div>
            <p className="mt-0.5 truncate text-caption text-vc-primary">
              {(event.metadata.url as string) ||
                (event.metadata.brandUrl as string) ||
                (event.metadata.errorMessage as string) ||
                JSON.stringify(event.metadata).slice(0, 80)}
            </p>
          </div>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-vc-tertiary transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <pre className="mt-2 max-h-72 overflow-auto bg-vc-muted p-2 text-data text-vc-primary font-mono">
          {JSON.stringify(event.metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "warn" | "fail";
}) {
  // "ok" is neutral text + a check icon, not green/chart-4 - colour never
  // carries the outcome by itself.
  const toneClass =
    tone === "warn" ? "text-(--warning)" : tone === "fail" ? "text-destructive" : "text-vc-primary";
  return (
    <div className="border-b border-vc-default px-6 py-4 first:pl-0 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <div
        className={cn(
          "text-stat font-semibold tabular-nums inline-flex items-center gap-1.5",
          toneClass,
        )}
      >
        {tone === "ok" && <CheckCircle className="h-4 w-4" aria-hidden="true" />}
        {value}
      </div>
      <div className="mt-0.5 text-data uppercase tracking-wider text-vc-tertiary">{label}</div>
    </div>
  );
}

export default function AdminScrapeInspector() {
  const { runId } = useParams({ from: "/_app/admin/scrape/$runId" });
  const { data, isLoading, isError, error } = useQuery<InspectorResponse>({
    queryKey: ["/api/admin/scrape", runId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/scrape/${runId}`);
      return res.json();
    },
    enabled: !!runId,
    // Auto-refresh while the run is mid-flight so operators see
    // events as they land. Stop polling once the run is terminal.
    refetchInterval: (q) => {
      const d = q.state.data as InspectorResponse | undefined;
      const status = d?.data?.run?.status;
      const TERMINAL = ["completed", "failed", "timeout", "cancelled"];
      if (status && TERMINAL.includes(status)) return false;
      return 3_000;
    },
  });

  if (isLoading) {
    return (
      <PanelPage>
        <div className="space-y-4 px-8 py-6">
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PanelPage>
    );
  }

  if (isError || !data?.success) {
    return (
      <PanelPage>
        <div className="px-8 py-6">
          <ErrorState
            title="Could not load scrape"
            description={error instanceof Error ? error.message : "Unknown error"}
            onRetry={() => window.location.reload()}
          />
        </div>
      </PanelPage>
    );
  }

  const { run, brand, pages, logs, events, facts, totals } = data.data;

  return (
    <PanelPage>
      {/* Title moved to src/routes/_app/admin.scrape.$runId.tsx's `head()`
          - metadata belongs to the route, not this component. That route
          can only set a static title (no loader computes the brand name
          server-side), unlike this component's former dynamic title. */}

      {/* Header */}
      <div className="px-8 py-6">
        <div className="flex items-baseline gap-2 mb-1">
          <h1 className="text-page font-semibold text-vc-primary">
            {brand?.name ?? "Unknown brand"}
          </h1>
          {brand?.website && (
            <a
              href={safeExternalHref(brand.website)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-caption text-vc-accent hover:underline"
            >
              <Globe className="h-3.5 w-3.5" />
              {brand.website}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-caption text-vc-tertiary tabular-nums">
          <span>Run {run.id.slice(0, 8)}</span>
          <span>·</span>
          <Badge
            className={
              run.status === "completed"
                ? "bg-secondary text-secondary-foreground"
                : run.status === "failed"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-(--warning)/10 text-(--warning)"
            }
          >
            {run.status}
          </Badge>
          {run.errorKind && <span className="text-destructive">errorKind: {run.errorKind}</span>}
          <span>·</span>
          <span>Started {new Date(run.startedAt).toISOString()}</span>
          {run.completedAt && (
            <>
              <span>·</span>
              <span>
                Duration{" "}
                {fmtDuration(
                  new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime(),
                )}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <PanelRow cols={1}>
        <Panel label="Overview" width="wide" border="last">
          <div className="grid grid-cols-2 md:grid-cols-5">
            <Stat
              label="Pages OK"
              value={`${totals.pagesOk}/${totals.pages}`}
              tone={totals.pagesOk === totals.pages ? "ok" : "warn"}
            />
            <Stat label="Pages skipped" value={totals.pagesSkipped} />
            <Stat
              label="Pages failed"
              value={totals.pagesFailed}
              tone={totals.pagesFailed > 0 ? "fail" : undefined}
            />
            <Stat
              label="Events failed"
              value={totals.eventsFailed}
              tone={totals.eventsFailed > 0 ? "fail" : undefined}
            />
            <Stat
              label="Facts (total)"
              value={totals.facts}
              tone={totals.facts > 0 ? "ok" : "warn"}
            />
          </div>
        </Panel>
      </PanelRow>

      {/* Event timeline */}
      <PanelRow cols={1}>
        <Panel
          label={
            <span className="inline-flex items-center gap-2">
              <Clock className="h-3 w-3" />
              {`Event timeline (${events.length})`}
            </span>
          }
          width="wide"
          border="last"
        >
          {events.length === 0 ? (
            <p className="text-caption text-vc-tertiary">
              No events recorded. (Either this run pre-dates the event log, or it failed before any
              event could be written. Check the page list below for context.)
            </p>
          ) : (
            events.map((e) => <EventCard key={e.id} event={e} />)
          )}
        </Panel>
      </PanelRow>

      {/* Per-source aggregate logs (static_pages / search_llm / user_enrich / aggregate) */}
      <PanelRow cols={1}>
        <Panel
          label={
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-3 w-3" />
              {`Per-source aggregate (${logs.length})`}
            </span>
          }
          width="wide"
          border="last"
        >
          <Table className="text-caption">
            <TableHeader>
              <TableRow className="text-left text-caption text-vc-tertiary uppercase tracking-wider hover:bg-transparent">
                <TableHead className="h-auto px-0 pb-2">Source</TableHead>
                <TableHead className="h-auto px-0 pb-2">Status</TableHead>
                <TableHead className="h-auto px-0 pb-2 tabular-nums">Facts</TableHead>
                <TableHead className="h-auto px-0 pb-2 tabular-nums">Latency</TableHead>
                <TableHead className="h-auto px-0 pb-2">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} className="border-t border-vc-default hover:bg-transparent">
                  <TableCell className="py-2 px-0 font-mono text-caption">{log.source}</TableCell>
                  <TableCell className="py-2 px-0">
                    <Badge variant={log.status === "done" ? "default" : "secondary"}>
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-0 tabular-nums">
                    {log.factCount ?? <NoValue />}
                  </TableCell>
                  <TableCell className="py-2 px-0 tabular-nums text-caption text-vc-tertiary">
                    {fmtDuration(log.latencyMs)}
                  </TableCell>
                  <TableCell className="py-2 px-0 text-caption text-destructive">
                    {log.errorKind ?? ""}
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-2 px-0 text-caption text-vc-tertiary">
                    No logs.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Panel>
      </PanelRow>

      {/* Pages table */}
      <PanelRow cols={1}>
        <Panel
          label={
            <span className="inline-flex items-center gap-2">
              <FileText className="h-3 w-3" />
              {`Pages (${pages.length})`}
            </span>
          }
          width="wide"
          border="last"
        >
          <Table className="text-caption">
            <TableHeader>
              <TableRow className="text-left text-caption text-vc-tertiary uppercase tracking-wider hover:bg-transparent">
                <TableHead className="h-auto px-0 pb-2">URL</TableHead>
                <TableHead className="h-auto px-0 pb-2">Status</TableHead>
                <TableHead className="h-auto px-0 pb-2 tabular-nums">Facts</TableHead>
                <TableHead className="h-auto px-0 pb-2">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((p) => (
                <TableRow
                  key={p.id}
                  className="border-t border-vc-default align-top hover:bg-transparent"
                >
                  <TableCell className="py-2 px-0">
                    <a
                      href={safeExternalHref(p.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-vc-accent hover:underline break-all"
                    >
                      {p.url}
                    </a>
                  </TableCell>
                  <TableCell className="py-2 px-0 whitespace-nowrap">
                    <Badge
                      variant={
                        p.status === "done"
                          ? "default"
                          : p.status?.startsWith("skipped_")
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {p.status ?? "pending"}
                    </Badge>
                    {p.statusCode && (
                      <span className="ml-2 text-caption text-vc-tertiary tabular-nums">
                        {p.statusCode}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 px-0 tabular-nums">
                    {p.factCount ?? <NoValue />}
                  </TableCell>
                  <TableCell className="py-2 px-0 text-caption text-destructive">
                    {p.errorKind ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </PanelRow>

      {/* Facts (final state) */}
      <PanelRow cols={1} last>
        <Panel
          label={
            <span className="inline-flex items-center gap-2">
              <CheckCircle className="h-3 w-3" />
              {`Facts in DB (${facts.length})`}
            </span>
          }
          width="wide"
          border="last"
        >
          <div className="max-h-96 space-y-1.5 overflow-auto">
            {facts.map((f) => (
              <div
                key={f.id}
                className="flex items-start gap-2 border-b border-vc-default pb-1.5 text-caption"
              >
                <Badge variant="outline" className="font-mono text-label">
                  {f.domain}.{f.factKey}
                </Badge>
                <span className="flex-1">{f.factValue}</span>
                <span className="text-vc-tertiary">{f.source}</span>
              </div>
            ))}
            {facts.length === 0 && (
              <p className="text-caption text-vc-tertiary">No facts persisted.</p>
            )}
          </div>
        </Panel>
      </PanelRow>

      <p className="px-8 py-4 text-caption text-vc-tertiary">
        <Link to="/admin/scrape" className="text-vc-accent hover:underline">
          ← Back to recent runs
        </Link>
      </p>
    </PanelPage>
  );
}
