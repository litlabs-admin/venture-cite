import { useMemo, useState } from "react";
import { Search, ArrowDownWideNarrow, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SiteHealthFinding } from "@shared/siteHealthFindings";

// ─── Checks table ────────────────────────────────────────────────────────
// Work / Evidence / Severity / Pages / Points / Action - the reference's
// 6-column layout (trakkr.ai/optimize), minus the container-query column
// collapse (not worth the complexity for a first pass; the columns just
// wrap on narrow viewports here instead of hiding).
//
// SEVERITY IS DERIVED, NOT STORED. SiteHealthFinding has no severity field -
// it has `points`, which is the real weight from scoreSiteHealth(). Severity
// buckets are read straight off that real number (>=10 High, 1-9 Medium,
// 0/advisory Low), never a separate invented classification.
export type Severity = "high" | "medium" | "low";

export function severityOf(f: SiteHealthFinding): Severity {
  if (f.advisory || f.points === 0) return "low";
  if (f.points >= 10) return "high";
  return "medium";
}

const SEVERITY_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };
const SEVERITY_ORDER: Severity[] = ["high", "medium", "low"];

// Checks whose fix is a mechanical content edit (meta/OG tags) rather than
// something needing judgment (rewriting prose, restructuring a page). Drives
// which drawer body + action-button label a row gets. Small and explicit,
// not inferred, since guessing wrong here would mislead about what's
// actually automatable.
const AUTOMATABLE_IDS = new Set(["content-meta-tags", "content-open-graph"]);

export type SortKey = "priority" | "points" | "pages" | "name";

interface ChecksTableProps {
  findings: SiteHealthFinding[];
  score: number | null;
  onOpenFinding: (finding: SiteHealthFinding) => void;
}

export function ChecksTable({ findings, score, onOpenFinding }: ChecksTableProps) {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [sort, setSort] = useState<SortKey>("priority");

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const f of findings) counts[severityOf(f)]++;
    return counts;
  }, [findings]);

  const filtered = useMemo(() => {
    let rows = findings;
    if (severityFilter !== "all") rows = rows.filter((f) => severityOf(f) === severityFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (f) => f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q),
      );
    }
    const sorted = [...rows];
    switch (sort) {
      case "points":
        sorted.sort((a, b) => b.points - a.points);
        break;
      case "pages":
        sorted.sort((a, b) => b.affectedUrls.length - a.affectedUrls.length);
        break;
      case "name":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "priority":
      default:
        // Priority = severity, then points within severity - same ordering
        // computeSiteHealthFindings already produces (points desc), but
        // re-sort explicitly so filtering/search never disturbs it.
        sorted.sort((a, b) => {
          const sevDiff =
            SEVERITY_ORDER.indexOf(severityOf(a)) - SEVERITY_ORDER.indexOf(severityOf(b));
          return sevDiff !== 0 ? sevDiff : b.points - a.points;
        });
    }
    return sorted;
  }, [findings, severityFilter, search, sort]);

  const totalPoints = findings.reduce((sum, f) => sum + f.points, 0);

  return (
    <div className="border-b border-vc-default">
      <div className="flex flex-wrap items-center gap-2 px-8 py-4">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-vc-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search checks..."
            className="h-8 w-full rounded border border-vc-default bg-vc-surface pl-8 pr-3 text-caption text-vc-primary placeholder:text-vc-tertiary focus:outline-none focus:ring-2 focus:ring-vc-accent/20"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(["all", ...SEVERITY_ORDER] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverityFilter(s)}
              className={`h-8 rounded border px-2.5 text-caption font-medium transition-colors ${
                severityFilter === s
                  ? "border-vc-accent bg-vc-accent-subtle text-vc-accent"
                  : "border-vc-default text-vc-secondary hover:bg-vc-muted/50"
              }`}
            >
              {s === "all" ? "All" : SEVERITY_LABEL[s as Severity]}
              {s !== "all" && (
                <span className="ml-1 tabular-nums text-vc-tertiary">
                  {severityCounts[s as Severity]}
                </span>
              )}
            </button>
          ))}
          <span className="text-data tabular-nums text-vc-tertiary">
            {filtered.length} of {findings.length}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded border border-vc-default px-2.5 text-caption font-medium text-vc-secondary hover:bg-vc-muted/50"
              >
                <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden />
                {sort === "priority"
                  ? "Priority"
                  : sort === "points"
                    ? "Points"
                    : sort === "pages"
                      ? "Pages"
                      : "Name"}
                <ChevronDown className="h-3 w-3 opacity-50" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(["priority", "points", "pages", "name"] as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onSelect={() => setSort(k)}>
                  {k === "priority"
                    ? "Priority"
                    : k === "points"
                      ? "Points"
                      : k === "pages"
                        ? "Pages"
                        : "Name"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Six columns (two of them flexible-width prose) never fit a phone-width
          viewport - rather than let the grid silently crush/overlap the Work
          and Evidence text (which is what happened before this wrapper was
          added), the table scrolls horizontally below its own min-width,
          same as any other wide content in this app. */}
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.4fr)_88px_72px_72px_112px] items-center gap-x-4 border-b border-vc-default px-8 h-10">
            <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
              Work
            </span>
            <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
              Evidence
            </span>
            <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
              Severity
            </span>
            <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
              Pages
            </span>
            <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
              Points
            </span>
            <span />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 py-12 text-center">
              <p className="text-body text-vc-tertiary">No checks match this filter.</p>
            </div>
          ) : (
            filtered.map((f) => {
              const sev = severityOf(f);
              const automatable = AUTOMATABLE_IDS.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onOpenFinding(f)}
                  className="grid w-full grid-cols-[minmax(0,1.15fr)_minmax(0,1.4fr)_88px_72px_72px_112px] items-center gap-x-4 border-b border-vc-default px-8 h-11 text-left transition-colors hover:bg-vc-muted/40"
                >
                  <span className="truncate text-caption text-vc-primary">{f.title}</span>
                  <span className="truncate text-data text-vc-tertiary">{f.description}</span>
                  <span className="text-data text-vc-secondary">{SEVERITY_LABEL[sev]}</span>
                  <span className="tabular-nums text-data text-vc-tertiary">
                    {f.affectedUrls.length > 0 ? f.affectedUrls.length : "site"}
                  </span>
                  <span className="tabular-nums text-data font-semibold text-vc-accent">
                    {f.advisory ? "advisory" : `+${f.points}`}
                  </span>
                  <span className="truncate text-caption font-medium text-vc-accent">
                    {automatable ? "Fix it for me" : "How to fix"}
                  </span>
                </button>
              );
            })
          )}

          <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.4fr)_88px_72px_72px_112px] items-center gap-x-4 px-8 h-10">
            <span className="text-caption font-semibold text-vc-primary">
              Checks score {score !== null ? score : "–"}
            </span>
            <span className="text-data text-vc-tertiary">
              clearing these {findings.length} check{findings.length === 1 ? "" : "s"} takes it to
              100
            </span>
            <span />
            <span />
            <span className="tabular-nums text-data font-semibold text-vc-accent">
              +{totalPoints}
            </span>
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
