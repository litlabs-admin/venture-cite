import { useMemo } from "react";
import { StatusDot, type StatusDotTone } from "@/components/foundations/StatusDot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BrandFactScrapePage } from "@shared/schema";

interface ScrapePagesPanelProps {
  pages: BrandFactScrapePage[];
  runId: string;
  isStreaming: boolean;
  runStartedAt?: string | Date | null;
}

const STATUS_TO_TONE: Record<BrandFactScrapePage["status"], StatusDotTone> = {
  pending: "pending",
  fetching: "pending",
  extracting: "warn",
  done: "success",
  failed: "fail",
  skipped_robots: "fail",
  skipped_lang: "fail",
  skipped_spa: "fail",
};

const STATUS_LABEL: Record<BrandFactScrapePage["status"], string> = {
  pending: "Queued",
  fetching: "Fetching",
  extracting: "Extracting",
  done: "Done",
  failed: "Failed",
  skipped_robots: "Robots.txt",
  skipped_lang: "Language",
  skipped_spa: "JS-only",
};

function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(
  fetchedAt: string | Date | null | undefined,
  startedAt?: string | Date | null,
): string {
  if (!fetchedAt || !startedAt) return "—";
  const ms = new Date(fetchedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function PageRow({
  page,
  runStartedAt,
}: {
  page: BrandFactScrapePage;
  runStartedAt?: string | Date | null;
}) {
  const tone = STATUS_TO_TONE[page.status];
  return (
    <tr className="border-t border-border text-sm" data-testid={`scrape-page-row-${page.id}`}>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <StatusDot tone={tone} aria-label={`Status: ${STATUS_LABEL[page.status]}`} />
          <span className="text-xs text-muted-foreground">{STATUS_LABEL[page.status]}</span>
        </div>
      </td>
      <td className="py-2 pr-3 max-w-xs">
        <span className="line-clamp-1 font-mono text-xs" title={page.url}>
          {truncate(page.url, 60)}
        </span>
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums text-muted-foreground">
        {formatBytes(page.bytes)}
      </td>
      <td className="py-2 pr-3 text-xs tabular-nums">{page.factCount ?? 0}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">{page.lang ?? "—"}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">
        {page.errorKind ? truncate(page.errorKind, 20) : "—"}
      </td>
      <td className="py-2 text-xs tabular-nums text-muted-foreground">
        {formatDuration(page.fetchedAt, runStartedAt)}
      </td>
    </tr>
  );
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={`skel-${i}`} className="border-t border-border">
          <td className="py-2 pr-3">
            <div className="flex items-center gap-2">
              <StatusDot tone="pending" />
              <span className="text-xs text-muted-foreground">Queued</span>
            </div>
          </td>
          <td className="py-2 pr-3">
            <div className="h-3 w-40 rounded bg-muted animate-pulse" />
          </td>
          <td className="py-2 pr-3">
            <div className="h-3 w-12 rounded bg-muted animate-pulse" />
          </td>
          <td className="py-2 pr-3">
            <div className="h-3 w-6 rounded bg-muted animate-pulse" />
          </td>
          <td className="py-2 pr-3">
            <div className="h-3 w-6 rounded bg-muted animate-pulse" />
          </td>
          <td className="py-2 pr-3">
            <div className="h-3 w-12 rounded bg-muted animate-pulse" />
          </td>
          <td className="py-2">
            <div className="h-3 w-10 rounded bg-muted animate-pulse" />
          </td>
        </tr>
      ))}
    </>
  );
}

function PagesTable({
  pages,
  isStreaming,
  runStartedAt,
}: {
  pages: BrandFactScrapePage[];
  isStreaming: boolean;
  runStartedAt?: string | Date | null;
}) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2 pr-3 font-medium">Status</th>
          <th className="py-2 pr-3 font-medium">URL</th>
          <th className="py-2 pr-3 font-medium">Bytes</th>
          <th className="py-2 pr-3 font-medium">Facts</th>
          <th className="py-2 pr-3 font-medium">Lang</th>
          <th className="py-2 pr-3 font-medium">Issue</th>
          <th className="py-2 font-medium">Time</th>
        </tr>
      </thead>
      <tbody>
        {pages.length === 0 && isStreaming ? <SkeletonRows count={3} /> : null}
        {pages.map((page) => (
          <PageRow key={page.id} page={page} runStartedAt={runStartedAt} />
        ))}
      </tbody>
    </table>
  );
}

export function ScrapePagesPanel({
  pages,
  runId: _runId,
  isStreaming,
  runStartedAt,
}: ScrapePagesPanelProps) {
  const summary = useMemo(() => {
    const done = pages.filter((p) => p.status === "done").length;
    const failed = pages.filter((p) =>
      ["failed", "skipped_robots", "skipped_lang", "skipped_spa"].includes(p.status),
    ).length;
    const inFlight = pages.filter((p) =>
      ["pending", "fetching", "extracting"].includes(p.status),
    ).length;
    return { done, failed, inFlight, total: pages.length };
  }, [pages]);

  // While streaming: always visible. After completion: collapsed in <details>.
  if (isStreaming) {
    return (
      <Card data-tour-id="fact-sheet.pages-panel" data-testid="scrape-pages-panel-live">
        <CardHeader>
          <CardTitle className="text-base">
            Reading pages{" "}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {summary.done} done · {summary.inFlight} in flight · {summary.failed} skipped
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <PagesTable pages={pages} isStreaming={isStreaming} runStartedAt={runStartedAt} />
        </CardContent>
      </Card>
    );
  }

  // Post-completion: collapsed semantic <details>, summary shows count.
  return (
    <Card data-tour-id="fact-sheet.pages-panel" data-testid="scrape-pages-panel-collapsed">
      <CardContent className="p-0">
        <details className="group">
          <summary
            className={cn(
              "flex cursor-pointer items-center justify-between p-4 text-sm font-medium",
              "select-none hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            data-testid="scrape-pages-panel-summary"
          >
            <span>
              View per-page details
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({summary.total} pages · {summary.done} done · {summary.failed} skipped)
              </span>
            </span>
            <span
              aria-hidden
              className="text-xs text-muted-foreground transition-transform group-open:rotate-90"
            >
              ▶
            </span>
          </summary>
          <div className="overflow-x-auto px-4 pb-4">
            <PagesTable pages={pages} isStreaming={false} runStartedAt={runStartedAt} />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
