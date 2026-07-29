import { useMemo } from "react";
import { StatusDot, type StatusDotTone } from "@/components/foundations/StatusDot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <TableRow
      className="text-caption hover:bg-transparent"
      data-testid={`scrape-page-row-${page.id}`}
    >
      <TableCell className="py-2 pr-3 px-0">
        <div className="flex items-center gap-2">
          <StatusDot tone={tone} aria-label={`Status: ${STATUS_LABEL[page.status]}`} />
          <span className="text-caption text-muted-foreground">{STATUS_LABEL[page.status]}</span>
        </div>
      </TableCell>
      <TableCell className="py-2 pr-3 px-0 max-w-xs">
        <span className="line-clamp-1 font-mono text-caption" title={page.url}>
          {truncate(page.url, 60)}
        </span>
      </TableCell>
      <TableCell className="py-2 pr-3 px-0 text-caption tabular-nums text-muted-foreground">
        {formatBytes(page.bytes)}
      </TableCell>
      <TableCell className="py-2 pr-3 px-0 text-caption tabular-nums">
        {page.factCount ?? 0}
      </TableCell>
      <TableCell className="py-2 pr-3 px-0 text-caption text-muted-foreground">
        {page.lang ?? "—"}
      </TableCell>
      <TableCell className="py-2 pr-3 px-0 text-caption text-muted-foreground">
        {page.errorKind ? truncate(page.errorKind, 20) : "—"}
      </TableCell>
      <TableCell className="py-2 px-0 text-caption tabular-nums text-muted-foreground">
        {formatDuration(page.fetchedAt, runStartedAt)}
      </TableCell>
    </TableRow>
  );
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={`skel-${i}`} className="hover:bg-transparent">
          <TableCell className="py-2 pr-3 px-0">
            <div className="flex items-center gap-2">
              <StatusDot tone="pending" />
              <span className="text-caption text-muted-foreground">Queued</span>
            </div>
          </TableCell>
          <TableCell className="py-2 pr-3 px-0">
            <Skeleton className="h-3 w-40" />
          </TableCell>
          <TableCell className="py-2 pr-3 px-0">
            <Skeleton className="h-3 w-12" />
          </TableCell>
          <TableCell className="py-2 pr-3 px-0">
            <Skeleton className="h-3 w-6" />
          </TableCell>
          <TableCell className="py-2 pr-3 px-0">
            <Skeleton className="h-3 w-6" />
          </TableCell>
          <TableCell className="py-2 pr-3 px-0">
            <Skeleton className="h-3 w-12" />
          </TableCell>
          <TableCell className="py-2 px-0">
            <Skeleton className="h-3 w-10" />
          </TableCell>
        </TableRow>
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
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-auto py-2 pr-3 px-0 text-caption uppercase tracking-wide text-muted-foreground font-medium">
            Status
          </TableHead>
          <TableHead className="h-auto py-2 pr-3 px-0 text-caption uppercase tracking-wide text-muted-foreground font-medium">
            URL
          </TableHead>
          <TableHead className="h-auto py-2 pr-3 px-0 text-caption uppercase tracking-wide text-muted-foreground font-medium">
            Bytes
          </TableHead>
          <TableHead className="h-auto py-2 pr-3 px-0 text-caption uppercase tracking-wide text-muted-foreground font-medium">
            Facts
          </TableHead>
          <TableHead className="h-auto py-2 pr-3 px-0 text-caption uppercase tracking-wide text-muted-foreground font-medium">
            Lang
          </TableHead>
          <TableHead className="h-auto py-2 pr-3 px-0 text-caption uppercase tracking-wide text-muted-foreground font-medium">
            Issue
          </TableHead>
          <TableHead className="h-auto py-2 px-0 text-caption uppercase tracking-wide text-muted-foreground font-medium">
            Time
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pages.length === 0 && isStreaming ? <SkeletonRows count={3} /> : null}
        {pages.map((page) => (
          <PageRow key={page.id} page={page} runStartedAt={runStartedAt} />
        ))}
      </TableBody>
    </Table>
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
          <CardTitle className="text-ui">
            Reading pages{" "}
            <span className="ml-2 text-caption font-normal text-muted-foreground">
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
              "flex cursor-pointer items-center justify-between p-4 text-caption font-medium",
              "select-none hover:bg-accent/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
            )}
            data-testid="scrape-pages-panel-summary"
          >
            <span>
              View per-page details
              <span className="ml-2 text-caption font-normal text-muted-foreground">
                ({summary.total} pages · {summary.done} done · {summary.failed} skipped)
              </span>
            </span>
            <span
              aria-hidden
              className="text-caption text-muted-foreground transition-transform group-open:rotate-90"
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
