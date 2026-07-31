import { useMemo, useState } from "react";
import { useActiveCitationRuns } from "@/hooks/useActiveCitationRuns";
import { usePromptResults } from "@/hooks/usePrompts";
import { useInspector } from "@/components/AppShell";
import PromptDetail from "./PromptDetail";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
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
  TrendingUp,
  CheckCircle2,
  Loader2,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PlatformResultCard, type PlatformResult } from "./PlatformResultCard";
import EmptyResultsHero from "./EmptyResultsHero";
import CitedMentionsStrip, { type CitedMention } from "./CitedMentionsStrip";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { PanelLabel } from "@/components/dashboard-panels/primitives";

// Wave 9: minimum sample size before a platform competes for "Best
// Platform". Without this, a platform with 1/1 cited (100%) beats one
// with 8/10 (80%) - meaningless on small samples.
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
};

export default function ResultsTab({ selectedBrandId, hasPrompts, runMutation }: ResultsTabProps) {
  // Wave 9: keep results in sync during a citation run by polling 6s
  // while one is active. TanStack dedupes the gate query so this is free.
  // Wave 9.1: when a fresh run is in flight, scope the query to rankings
  // *from* that run (server-side filter via the `since` param). Without
  // this, cells that haven't been re-checked yet show stale data from
  // the prior run while completed cells show new - a confusing mix the
  // user can't tell apart at a glance. Putting the run's startedAt in
  // the queryKey also rotates the cache so the user gets a clean reset
  // the moment the active-runs gate flips, instead of seeing old totals
  // bleed into the new run for one polling tick.
  const { hasActive, runs: activeRuns } = useActiveCitationRuns(selectedBrandId);
  const activeRunStartedAt = hasActive ? (activeRuns[0]?.startedAt ?? null) : null;
  const { data: resultsData, isLoading: resultsLoading } = usePromptResults(selectedBrandId, {
    since: activeRunStartedAt ?? undefined,
    refetchInterval: hasActive ? 6_000 : false,
  });
  const results = resultsData?.data as ResultsData | undefined;
  const inspector = useInspector();

  // Phase 3: derive highlight terms from the selected brand so the
  // PlatformResultCard can highlight brand mentions inside AI responses
  // and the CitedMentionsStrip can extract snippets around them.
  const { selectedBrand } = useBrandSelection();
  const highlightTerms = selectedBrand
    ? [selectedBrand.name, ...(selectedBrand.nameVariations ?? [])].filter(Boolean)
    : [];

  // Phase 3: flatten cited platform results into a single list for the
  // CitedMentionsStrip. Each entry corresponds to one (prompt × platform)
  // where isCited === true and we have something snippet-worthy to show.
  const citedMentions: CitedMention[] = (results?.byPrompt ?? []).flatMap((promptRow) =>
    (promptRow.platforms ?? [])
      .filter((p) => p.isCited && (p.fullResponse || p.snippet))
      .map((p) => ({
        platform: p.platform,
        prompt: promptRow.prompt,
        fullResponse: p.fullResponse,
        savedSnippet: p.snippet,
        // Future enhancement: scroll-to or expand the matching accordion item.
        onClick: undefined,
      })),
  );

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

  // Wave 9: stable tie-break on best-prompt - promptId asc - so the same
  // prompt wins across renders when tied on cited count. Otherwise the
  // dashboard "Top Prompt" can flicker between equally-good prompts.
  const bestPrompt = useMemo(() => {
    if (!results?.byPrompt?.length) return null;
    return [...results.byPrompt]
      .map((p) => ({ ...p, citedCount: p.platforms.filter((pl) => pl.isCited).length }))
      .sort((a, b) => b.citedCount - a.citedCount || a.promptId.localeCompare(b.promptId))[0];
  }, [results?.byPrompt]);

  // Wave 9: header timestamp - "Last run 3m ago". Derived from byPlatform
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
      {/* Wave 9.2: header strip - last-run timestamp only. CSV export
          was removed in this wave; users asked for it to go away. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-vc-tertiary">
          {lastRunAt
            ? `Last run ${formatDistanceToNow(lastRunAt, { addSuffix: true })}`
            : "No completed runs yet"}
        </p>
      </div>

      {/* Wave 9: 0% citation rate gets a dedicated, actionable empty
          state instead of a sad zero. Hidden when ≥1% so the normal
          summary takes over. Left-border stripe, no card chrome - same
          treatment as crawler-check's "Top priority" recommendation. */}
      {results.citationRate === 0 && (
        <div className="border-l-[3px] border-warning bg-warning-subtle py-3 pl-3.5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-vc-primary">All platforms missed your brand</p>
              <ul className="text-caption text-vc-tertiary mt-2 space-y-1 list-disc pl-5">
                <li>
                  Add common surface forms to your brand&apos;s name variations (legal name, short
                  name, product line).
                </li>
                <li>
                  Re-check stored responses (overflow menu beside Run Check) so older runs pick up
                  the new variations.
                </li>
                <li>
                  Check that your tracked prompts mention the right category - generic queries
                  (&quot;best CRM&quot;) often miss niche brands.
                </li>
                <li>Publish or update articles targeting your tracked prompts.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Summary stats - three hairline-divided cells, not cards. */}
      <div className="grid grid-cols-1 divide-y divide-vc-default border-y border-vc-default md:grid-cols-3 md:divide-x md:divide-y-0">
        <div className="py-4 md:px-6 md:first:pl-0 md:last:pr-0">
          <div className="flex items-center justify-between mb-2">
            <PanelLabel>Overall Citation Rate</PanelLabel>
            <TrendingUp className="h-4 w-4 text-vc-hover" />
          </div>
          <p
            className="text-stat font-semibold tabular-nums text-vc-primary"
            data-testid="stat-citation-rate"
          >
            {results.citationRate}%
          </p>
          <p className="text-caption text-vc-tertiary mt-1">
            {results.totalCited} of {results.totalChecks} checks cited your brand
          </p>
        </div>
        <div className="py-4 md:px-6 md:first:pl-0 md:last:pr-0">
          <div className="flex items-center justify-between mb-2">
            <PanelLabel>Best Platform</PanelLabel>
            <CheckCircle2 className="h-4 w-4 text-positive" />
          </div>
          {/* Wave 9: when no platform has hit the min-sample threshold,
              surface "Need more data" rather than a misleading winner. */}
          <p className="text-stat font-semibold text-vc-primary" data-testid="stat-best-platform">
            {bestPlatform?.platform || "Need more data"}
          </p>
          <p className="text-caption text-vc-tertiary mt-1">
            {bestPlatform
              ? `${bestPlatform.citationRate}% citation rate`
              : `Each platform needs ≥${BEST_PLATFORM_MIN_CHECKS} checks before competing.`}
          </p>
        </div>
        <div className="py-4 md:px-6 md:first:pl-0 md:last:pr-0">
          <div className="flex items-center justify-between mb-2">
            <PanelLabel>Top Prompt</PanelLabel>
            <Sparkles className="h-4 w-4 text-vc-hover" />
          </div>
          <p
            className="text-ui font-semibold text-vc-primary line-clamp-2"
            data-testid="stat-top-prompt"
          >
            {bestPrompt ? `"${bestPrompt.prompt}"` : "-"}
          </p>
          <p className="text-caption text-vc-tertiary mt-1">
            {bestPrompt ? `Cited on ${bestPrompt.citedCount} platforms` : "No data yet"}
          </p>
        </div>
      </div>

      {/* Phase 3: Cited mentions strip - surface where the brand was
          cited above the existing stats so users don't have to expand
          every accordion to find them. Renders nothing when empty. */}
      {citedMentions.length > 0 && (
        <CitedMentionsStrip mentions={citedMentions} highlightTerms={highlightTerms} />
      )}

      {/* Performance by Platform */}
      <div className="border-b border-vc-default pb-2">
        <PanelLabel>Performance by Platform</PanelLabel>
        {/* Wave 9: sortable column headers. Click to toggle asc/desc;
            clicking a different column resets to a sensible default
            direction (asc for platform name, desc for everything else). */}
        <div className="mt-3 overflow-x-auto">
          <Table className="text-body">
            <TableHeader>
              <TableRow className="border-vc-default">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlatforms.map((p) => (
                <TableRow
                  key={p.platform}
                  data-testid={`platform-row-${p.platform}`}
                  className="border-b border-vc-default last:border-b-0 hover:bg-vc-muted/50"
                >
                  <TableCell className="py-2 font-medium tabular-nums">{p.platform}</TableCell>
                  <TableCell className="text-right py-2 tabular-nums">{p.cited}</TableCell>
                  <TableCell className="text-right py-2 tabular-nums">{p.checks}</TableCell>
                  <TableCell className="text-right py-2">
                    <Badge variant={p.citationRate >= 50 ? "default" : "outline"}>
                      {p.citationRate}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right py-2 text-caption text-vc-tertiary">
                    {p.lastRun
                      ? formatDistanceToNow(new Date(p.lastRun), { addSuffix: true })
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Results by Prompt */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <PanelLabel>Results by Prompt</PanelLabel>
            <p className="mt-1 text-caption text-vc-tertiary">
              Click a prompt to see each AI&apos;s full answer and whether your brand was cited.
            </p>
          </div>
          {/* Wave 9: actionable sort. Default = original prompt order;
              "Least cited" surfaces problem prompts first (where work
              pays off). */}
          <Select value={promptSort} onValueChange={(v) => setPromptSort(v as PromptSortKey)}>
            <SelectTrigger className="w-[170px] h-9 text-caption">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default order</SelectItem>
              <SelectItem value="least-cited">Least cited first</SelectItem>
              <SelectItem value="most-cited">Most cited first</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3">
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
                    <div className="flex items-center justify-between gap-2 mb-2 px-1">
                      {row.rationale ? (
                        <p className="text-caption text-vc-tertiary italic">
                          Why this prompt: {row.rationale}
                        </p>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        className="text-caption text-primary hover:underline shrink-0"
                        onClick={() =>
                          inspector.open({
                            title: row.prompt,
                            body: (
                              <PromptDetail
                                promptId={row.promptId}
                                promptText={row.prompt}
                                brandId={selectedBrandId}
                              />
                            ),
                          })
                        }
                        data-testid={`button-open-prompt-history-${i}`}
                      >
                        View full history
                      </button>
                    </div>
                    {row.platforms.length === 0 ? (
                      // Wave 9.1: distinguish "never checked" from
                      // "pending in this run". With the since-filter
                      // active, an empty platforms array during a run
                      // means this prompt hasn't been re-checked yet -
                      // not that there's no history at all.
                      hasActive ? (
                        <p className="text-caption text-vc-tertiary italic flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Pending re-check… platform results will appear as each one finishes.
                        </p>
                      ) : (
                        <p className="text-caption text-vc-tertiary">
                          No results yet - run a citation check.
                        </p>
                      )
                    ) : (
                      <div className="space-y-3">
                        {row.platforms.map((plat, j) => (
                          <PlatformResultCard
                            key={`${plat.platform}-${j}`}
                            result={plat}
                            highlightTerms={highlightTerms}
                          />
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </div>
    </>
  ) : hasActive ? (
    // Wave 9.1: when a fresh run just started, the since-filter
    // initially returns 0 rankings (no platform has finished yet).
    // Show in-progress messaging instead of the empty-state hero
    // so users don't think the run failed. The hero returns once
    // the active-runs gate flips back to false.
    <div className="py-12 text-center">
      <Loader2 className="h-12 w-12 mx-auto text-vc-hover mb-3 animate-spin" />
      <p className="text-vc-tertiary mb-2">Citation run in progress…</p>
      <p className="text-caption text-vc-tertiary">
        Results will appear here as each platform finishes - usually within a few seconds per check.
      </p>
    </div>
  ) : (
    // Phase 1: empty-state hero with the LLM re-index lag explainer
    // (1–2 week delay) - same wording as the dashboard timeline so
    // users get a consistent message wherever they land first.
    <EmptyResultsHero
      action={
        hasPrompts && !runMutation.isPending
          ? { label: "Run a check now", onClick: () => runMutation.mutate() }
          : undefined
      }
    />
  );
}

// Wave 9: minimal sortable column header. Kept inline rather than spun out
// into a shared component - only the platform table uses this pattern, and
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
