import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveCitationRuns } from "@/hooks/useActiveCitationRuns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Play,
  TrendingUp,
  CheckCircle2,
  Loader2,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PlatformResultCard, type PlatformResult } from "./PlatformResultCard";

// Wave 9: minimum sample size before a platform competes for "Best
// Platform". Without this, a platform with 1/1 cited (100%) beats one
// with 8/10 (80%) — meaningless on small samples.
const BEST_PLATFORM_MIN_CHECKS = 5;

type PromptRow = {
  promptId: string;
  prompt: string;
  rationale: string | null;
  platforms: PlatformResult[];
};

type PlatformStat = {
  platform: string;
  cited: number;
  checks: number;
  citationRate: number;
  lastRun: string | null;
};

type ResultsData = {
  byPlatform: PlatformStat[];
  byPrompt: PromptRow[];
  totalChecks: number;
  totalCited: number;
  citationRate: number;
};

type ResultsTabProps = {
  selectedBrandId: string;
  hasPrompts: boolean;
  runMutation: { mutate: () => void; isPending: boolean };
  runLoadingMessage: string;
};

export default function ResultsTab({
  selectedBrandId,
  hasPrompts,
  runMutation,
  runLoadingMessage,
}: ResultsTabProps) {
  // Wave 9: keep results in sync during a citation run by polling 6s
  // while one is active. TanStack dedupes the gate query so this is free.
  // Wave 9.1: when a fresh run is in flight, scope the query to rankings
  // *from* that run (server-side filter via the `since` param). Without
  // this, cells that haven't been re-checked yet show stale data from
  // the prior run while completed cells show new — a confusing mix the
  // user can't tell apart at a glance. Putting the run's startedAt in
  // the queryKey also rotates the cache so the user gets a clean reset
  // the moment the active-runs gate flips, instead of seeing old totals
  // bleed into the new run for one polling tick.
  const { hasActive, runs: activeRuns } = useActiveCitationRuns(selectedBrandId);
  const activeRunStartedAt = hasActive ? (activeRuns[0]?.startedAt ?? null) : null;
  const { data: resultsData, isLoading: resultsLoading } = useQuery<{
    success: boolean;
    data: ResultsData;
  }>({
    // The `{ since }` segment is an object — the default queryFn turns
    // object segments into URL query params, so we get e.g.
    // `/api/.../results?since=2026-04-29T08:24:00.000Z` automatically.
    // Empty string is filtered out, so when no run is active this
    // resolves to the bare URL (full-history view).
    queryKey: [
      `/api/brand-prompts/${selectedBrandId}/results`,
      { since: activeRunStartedAt ?? "" },
    ],
    enabled: !!selectedBrandId,
    refetchInterval: hasActive ? 6_000 : false,
  });
  const results = resultsData?.data;

  // Wave 9: best-platform requires a minimum sample so we don't celebrate
  // a 1/1=100% platform over an 8/10=80% one. Falls back to the top by
  // raw rate (with sample-size warning) when no platform clears the bar.
  const bestPlatform = useMemo(() => {
    const list = results?.byPlatform ?? [];
    if (!list.length) return null;
    const eligible = list.filter((p) => p.checks >= BEST_PLATFORM_MIN_CHECKS);
    if (eligible.length === 0) return null;
    return [...eligible].sort((a, b) => b.citationRate - a.citationRate)[0];
  }, [results?.byPlatform]);

  // Wave 9: stable tie-break on best-prompt — promptId asc — so the same
  // prompt wins across renders when tied on cited count. Otherwise the
  // dashboard "Top Prompt" can flicker between equally-good prompts.
  const bestPrompt = useMemo(() => {
    if (!results?.byPrompt?.length) return null;
    return [...results.byPrompt]
      .map((p) => ({ ...p, citedCount: p.platforms.filter((pl) => pl.isCited).length }))
      .sort((a, b) => b.citedCount - a.citedCount || a.promptId.localeCompare(b.promptId))[0];
  }, [results?.byPrompt]);

  // Wave 9: header timestamp — "Last run 3m ago". Derived from byPlatform
  // (each platform reports its own last-run, take the max).
  const lastRunAt = useMemo(() => {
    const stamps = (results?.byPlatform ?? [])
      .map((p) => (p.lastRun ? new Date(p.lastRun).getTime() : 0))
      .filter((n) => n > 0);
    if (stamps.length === 0) return null;
    return new Date(Math.max(...stamps));
  }, [results?.byPlatform]);

  // Wave 9: per-platform sortable table.
  type PlatformSortKey = "platform" | "cited" | "checks" | "citationRate" | "lastRun";
  const [platformSort, setPlatformSort] = useState<{
    key: PlatformSortKey;
    dir: "asc" | "desc";
  }>({ key: "citationRate", dir: "desc" });
  const sortedPlatforms = useMemo(() => {
    const list = results?.byPlatform ? [...results.byPlatform] : [];
    const { key, dir } = platformSort;
    list.sort((a, b) => {
      let cmp = 0;
      if (key === "platform") cmp = a.platform.localeCompare(b.platform);
      else if (key === "lastRun")
        cmp =
          (a.lastRun ? new Date(a.lastRun).getTime() : 0) -
          (b.lastRun ? new Date(b.lastRun).getTime() : 0);
      else cmp = (a[key] as number) - (b[key] as number);
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [results?.byPlatform, platformSort]);
  const togglePlatformSort = (key: PlatformSortKey) => {
    setPlatformSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "platform" ? "asc" : "desc" },
    );
  };

  // Wave 9: per-prompt accordion sort.
  type PromptSortKey = "default" | "least-cited" | "most-cited";
  const [promptSort, setPromptSort] = useState<PromptSortKey>("default");
  const sortedPrompts = useMemo(() => {
    const list = results?.byPrompt ? [...results.byPrompt] : [];
    if (promptSort === "default") return list;
    return list.sort((a, b) => {
      const aCited = a.platforms.filter((p) => p.isCited).length;
      const bCited = b.platforms.filter((p) => p.isCited).length;
      return promptSort === "least-cited" ? aCited - bCited : bCited - aCited;
    });
  }, [results?.byPrompt, promptSort]);

  return resultsLoading ? (
    <Skeleton className="h-48 w-full" />
  ) : results && results.totalChecks > 0 ? (
    <>
      {/* Wave 9.2: header strip — last-run timestamp only. CSV export
          was removed in this wave; users asked for it to go away. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {lastRunAt
            ? `Last run ${formatDistanceToNow(lastRunAt, { addSuffix: true })}`
            : "No completed runs yet"}
        </p>
      </div>

      {/* Wave 9: 0% citation rate gets a dedicated, actionable empty
          state instead of a sad zero. Hidden when ≥1% so the normal
          summary takes over. */}
      {results.citationRate === 0 && (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">All platforms missed your brand</p>
                <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc pl-5">
                  <li>
                    Add common surface forms to your brand&apos;s name variations (legal name, short
                    name, product line).
                  </li>
                  <li>
                    Re-check stored responses (overflow menu beside Run Check) so older runs pick up
                    the new variations.
                  </li>
                  <li>
                    Check that your tracked prompts mention the right category — generic queries
                    (&quot;best CRM&quot;) often miss niche brands.
                  </li>
                  <li>Publish or update articles targeting your tracked prompts.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Overall Citation Rate</p>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold text-foreground" data-testid="stat-citation-rate">
              {results.citationRate}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {results.totalCited} of {results.totalChecks} checks cited your brand
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Best Platform</p>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            {/* Wave 9: when no platform has hit the min-sample threshold,
                surface "Need more data" rather than a misleading winner. */}
            <p className="text-3xl font-bold text-foreground" data-testid="stat-best-platform">
              {bestPlatform?.platform || "Need more data"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {bestPlatform
                ? `${bestPlatform.citationRate}% citation rate`
                : `Each platform needs ≥${BEST_PLATFORM_MIN_CHECKS} checks before competing.`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Top Prompt</p>
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>
            <p
              className="text-base font-semibold text-foreground line-clamp-2"
              data-testid="stat-top-prompt"
            >
              {bestPrompt ? `"${bestPrompt.prompt}"` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {bestPrompt ? `Cited on ${bestPrompt.citedCount} platforms` : "No data yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance by Platform */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance by Platform</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Wave 9: sortable column headers. Click to toggle asc/desc;
              clicking a different column resets to a sensible default
              direction (asc for platform name, desc for everything else). */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <SortableTh
                    active={platformSort.key === "platform"}
                    dir={platformSort.dir}
                    onClick={() => togglePlatformSort("platform")}
                    align="left"
                  >
                    Platform
                  </SortableTh>
                  <SortableTh
                    active={platformSort.key === "cited"}
                    dir={platformSort.dir}
                    onClick={() => togglePlatformSort("cited")}
                    align="right"
                  >
                    Cited
                  </SortableTh>
                  <SortableTh
                    active={platformSort.key === "checks"}
                    dir={platformSort.dir}
                    onClick={() => togglePlatformSort("checks")}
                    align="right"
                  >
                    Checks
                  </SortableTh>
                  <SortableTh
                    active={platformSort.key === "citationRate"}
                    dir={platformSort.dir}
                    onClick={() => togglePlatformSort("citationRate")}
                    align="right"
                  >
                    Rate
                  </SortableTh>
                  <SortableTh
                    active={platformSort.key === "lastRun"}
                    dir={platformSort.dir}
                    onClick={() => togglePlatformSort("lastRun")}
                    align="right"
                  >
                    Last Run
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedPlatforms.map((p) => (
                  <tr
                    key={p.platform}
                    className="border-b border-border"
                    data-testid={`platform-row-${p.platform}`}
                  >
                    <td className="py-3 font-medium">{p.platform}</td>
                    <td className="text-right py-3">{p.cited}</td>
                    <td className="text-right py-3">{p.checks}</td>
                    <td className="text-right py-3">
                      <Badge variant={p.citationRate >= 50 ? "default" : "outline"}>
                        {p.citationRate}%
                      </Badge>
                    </td>
                    <td className="text-right py-3 text-xs text-muted-foreground">
                      {p.lastRun
                        ? formatDistanceToNow(new Date(p.lastRun), { addSuffix: true })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Results by Prompt */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Results by Prompt</CardTitle>
              <CardDescription>
                Click a prompt to see each AI&apos;s full answer and whether your brand was cited.
              </CardDescription>
            </div>
            {/* Wave 9: actionable sort. Default = original prompt order;
                "Least cited" surfaces problem prompts first (where work
                pays off). */}
            <Select value={promptSort} onValueChange={(v) => setPromptSort(v as PromptSortKey)}>
              <SelectTrigger className="w-[170px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default order</SelectItem>
                <SelectItem value="least-cited">Least cited first</SelectItem>
                <SelectItem value="most-cited">Most cited first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {sortedPrompts.map((row, i) => {
              const citedCount = row.platforms.filter((p) => p.isCited).length;
              return (
                <AccordionItem
                  key={row.promptId}
                  value={row.promptId}
                  data-testid={`prompt-result-${i}`}
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 flex-1 text-left">
                      <Badge variant="outline" className="shrink-0">
                        {i + 1}
                      </Badge>
                      <span className="flex-1 truncate">{row.prompt}</span>
                      <Badge variant={citedCount > 0 ? "default" : "outline"} className="shrink-0">
                        {citedCount}/{row.platforms.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {row.rationale && (
                      <p className="text-xs text-muted-foreground italic mb-3 px-1">
                        Why this prompt: {row.rationale}
                      </p>
                    )}
                    {row.platforms.length === 0 ? (
                      // Wave 9.1: distinguish "never checked" from
                      // "pending in this run". With the since-filter
                      // active, an empty platforms array during a run
                      // means this prompt hasn't been re-checked yet —
                      // not that there's no history at all.
                      hasActive ? (
                        <p className="text-sm text-muted-foreground italic flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Pending re-check… platform results will appear as each one finishes.
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No results yet — run a citation check.
                        </p>
                      )
                    ) : (
                      <div className="space-y-3">
                        {row.platforms.map((plat, j) => (
                          <PlatformResultCard key={`${plat.platform}-${j}`} result={plat} />
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>
    </>
  ) : (
    <Card>
      <CardContent className="py-12 text-center">
        {/* Wave 9.1: when a fresh run just started, the since-filter
            initially returns 0 rankings (no platform has finished yet).
            Show in-progress messaging instead of the "Run a check" CTA
            so users don't think the run failed. The CTA returns once
            the active-runs gate flips back to false. */}
        {hasActive ? (
          <>
            <Loader2 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3 animate-spin" />
            <p className="text-muted-foreground mb-2">Citation run in progress…</p>
            <p className="text-xs text-muted-foreground">
              Results will appear here as each platform finishes — usually within a few seconds per
              check.
            </p>
          </>
        ) : (
          <>
            <Play className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground mb-4">
              No results yet. Run a citation check to see how AI engines mention your brand.
            </p>
            {hasPrompts && (
              <Button
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {runMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {runLoadingMessage}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Check
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Wave 9: minimal sortable column header. Kept inline rather than spun out
// into a shared component — only the platform table uses this pattern, and
// pulling it into ui/ would be premature abstraction.
function SortableTh({
  active,
  dir,
  onClick,
  align,
  children,
}: {
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <th
      className={`py-2 font-medium text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={onClick}
    >
      <span
        className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{children}</span>
        <ArrowUpDown
          className={`h-3 w-3 ${active ? "text-foreground" : "opacity-40"} ${
            active && dir === "asc" ? "rotate-180" : ""
          }`}
        />
      </span>
    </th>
  );
}
