import { useMemo, useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import {
  useAllPrompts,
  usePrompt,
  usePromptScoreHistory,
  usePromptResults,
  usePromptTags,
} from "@/hooks/usePrompts";
import { PanelLabel, NoValue, CCLink } from "@/components/dashboard-panels/primitives";
import { PanelPage } from "@/components/dashboard-panels/Panel";
import { AI_PLATFORMS_ACTIVE } from "@shared/constants";
import { TagChip } from "@/components/prompts/TagChip";
import { PromptByModelTable } from "@/components/prompts/PromptByModelTable";
import { PhrasingsSection } from "@/components/prompts/PhrasingsSection";

// ─── Prompt detail page ──────────────────────────────────────────────────
// The page named in the removed code's own comment (/prompts/$promptId) -
// rebuilt for real. Every section reuses data this app already computes
// (usePromptScoreHistory's series/rank/rankDelta, usePromptResults' by-
// platform breakdown and sources) except where explicitly noted as scoped
// out (Volume - no data source and the user chose not to fake an LLM
// estimate). Phrasings (PhrasingsSection) is wired to real
// generate/analyze endpoints - phrasing results are exploratory and never
// touch geo_rankings, so they can't affect this prompt's own Score/Δ.

const RANGES = [
  { key: "7D", days: 7 },
  { key: "30D", days: 30 },
  { key: "90D", days: 90 },
] as const;

const ACCENT = "var(--brand-accent)";

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PromptDetailPage() {
  const { promptId } = useParams({ from: "/_app/prompts/$promptId" });
  const navigate = useNavigate();
  const { selectedBrandId } = useBrandSelection();
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30D");
  const [showAllSources, setShowAllSources] = useState(false);

  const { data: allData } = useAllPrompts(selectedBrandId);
  const { data: detailData, isLoading: detailLoading } = usePrompt(selectedBrandId, promptId);
  const { data: historyData } = usePromptScoreHistory(selectedBrandId);
  const { data: resultsData } = usePromptResults(selectedBrandId);
  const { data: tagsData } = usePromptTags(selectedBrandId);

  const prompt = detailData?.data;
  const allPrompts = allData?.data ?? [];
  const tracked = useMemo(() => allPrompts.filter((p) => p.status === "tracked"), [allPrompts]);
  const posIndex = tracked.findIndex((p) => p.id === promptId);

  const hist = (historyData?.data ?? []).find((h) => h.promptId === promptId);
  const byPromptResult = (resultsData?.data?.byPrompt ?? []).find((r) => r.promptId === promptId);
  const byPlatform = useMemo(() => {
    const out: Record<
      string,
      typeof byPromptResult extends undefined
        ? never
        : NonNullable<typeof byPromptResult>["platforms"][number]
    > = {} as never;
    for (const p of byPromptResult?.platforms ?? []) out[p.platform] = p;
    return out;
  }, [byPromptResult]);
  const modelsWithChecks = AI_PLATFORMS_ACTIVE.filter((p) => byPlatform[p]).length;

  const chartData = useMemo(() => {
    const cutoff = Date.now() - RANGES.find((r) => r.key === range)!.days * 86_400_000;
    return (hist?.series ?? [])
      .filter((pt) => new Date(pt.at).getTime() >= cutoff)
      .map((pt) => ({ date: pt.at, score: pt.score }));
  }, [hist, range]);

  const promptTags = (tagsData?.data ?? []).filter((t) => (prompt?.tagIds ?? []).includes(t.id));

  const brandDomain = resultsData?.data?.brandDomain ?? null;
  const sourceCounts = resultsData?.data?.sourceCounts ?? {};

  const sources = useMemo(() => {
    const seen = new Map<
      string,
      { url: string; name: string | null; type: string | null; ownSite: boolean }
    >();
    for (const p of byPromptResult?.platforms ?? []) {
      for (const url of p.citedUrls ?? []) {
        if (!seen.has(url)) {
          let domain: string | null = null;
          try {
            domain = new URL(url).hostname.replace(/^www\./, "");
          } catch {
            domain = null;
          }
          seen.set(url, {
            url,
            name: p.citingOutletName ?? null,
            type: p.sourceType ?? null,
            ownSite: !!brandDomain && domain === brandDomain,
          });
        }
      }
    }
    // Brand-wide "cited N times" - from the results endpoint's sourceCounts
    // (every appearance across every prompt's history), not just this
    // prompt's own citedUrls list, which is why trakkr's counts run much
    // higher than "how many times has this prompt cited it".
    return [...seen.values()]
      .map((s) => ({ ...s, count: sourceCounts[s.url] ?? 1 }))
      .sort((a, b) => b.count - a.count);
  }, [byPromptResult, brandDomain, sourceCounts]);

  const rankMovement = useMemo(() => {
    const out: Record<string, { rankDelta: number | null; isNew: boolean }> = {};
    for (const p of hist?.byPlatform ?? []) {
      out[p.platform] = { rankDelta: p.rankDelta, isNew: p.isNew };
    }
    return out;
  }, [hist]);

  if (!selectedBrandId) return null;

  return (
    <PanelPage>
      <div className="flex items-center justify-between border-b border-vc-default px-8 py-4">
        <CCLink
          dest={{ to: "/prompts" }}
          className="flex items-center gap-1 text-data text-vc-tertiary hover:text-vc-primary"
        >
          <X className="h-3.5 w-3.5" /> Prompts
        </CCLink>
        {tracked.length > 0 && (
          <div className="flex items-center gap-2 text-data text-vc-tertiary">
            <span className="tabular-nums">
              {posIndex >= 0 ? posIndex + 1 : "–"} of {tracked.length}
            </span>
            <button
              type="button"
              disabled={posIndex <= 0}
              onClick={() =>
                posIndex > 0 && navigate({ to: `/prompts/${tracked[posIndex - 1].id}` as never })
              }
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-vc-muted/60 disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={posIndex < 0 || posIndex >= tracked.length - 1}
              onClick={() =>
                posIndex >= 0 &&
                posIndex < tracked.length - 1 &&
                navigate({ to: `/prompts/${tracked[posIndex + 1].id}` as never })
              }
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-vc-muted/60 disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {detailLoading || !prompt ? (
        <div className="space-y-px">
          <div className="h-24 w-full animate-pulse bg-vc-muted/40" />
          <div className="h-40 w-full animate-pulse bg-vc-muted/40" />
        </div>
      ) : (
        <>
          <div className="border-b border-vc-default px-8 py-6">
            <div className="flex items-center gap-2 text-label font-semibold uppercase tracking-wider text-vc-label">
              <span>{prompt.status === "tracked" && !prompt.paused ? "Tracking" : "Paused"}</span>
              {promptTags.map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            </div>
            <h1 className="mt-1 text-page font-semibold text-vc-primary">{prompt.prompt}</h1>
          </div>

          {/* Trend chart + range toggle */}
          <div className="border-b border-vc-default px-8 py-6">
            <div className="mb-3 flex items-center justify-between">
              <PanelLabel>Visibility trend</PanelLabel>
              <fieldset className="inline-flex h-7 items-center rounded border border-vc-default bg-vc-surface p-0.5">
                <legend className="sr-only">Date range</legend>
                {RANGES.map((r) => (
                  <label key={r.key}>
                    <input
                      type="radio"
                      className="peer sr-only"
                      checked={range === r.key}
                      onChange={() => setRange(r.key)}
                    />
                    <span className="block cursor-pointer rounded px-2.5 py-1 text-label text-vc-tertiary peer-checked:bg-vc-accent-subtle peer-checked:text-vc-accent">
                      {r.key}
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
            {chartData.length < 2 ? (
              <p className="text-data text-vc-tertiary">
                Needs at least two runs in this window to draw a trend.
              </p>
            ) : (
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="promptScoreGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={fmtDay}
                      tick={{ fontSize: 10, fill: "var(--fg-tertiary)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--fg-tertiary)" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <div className="rounded border border-vc-default bg-vc-surface px-3 py-2 shadow-vc-overlay">
                            <p className="mb-0.5 text-label text-vc-tertiary">
                              {fmtDay(label as string)}
                            </p>
                            <p className="font-mono text-body font-semibold tabular-nums text-vc-primary">
                              {payload[0].value as number}
                            </p>
                          </div>
                        ) : null
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke={ACCENT}
                      strokeWidth={1.5}
                      fill="url(#promptScoreGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Stats - Volume deliberately omitted, no data source */}
            <div className="mt-4 grid grid-cols-3 gap-4 border-t border-vc-default pt-4">
              <div>
                <PanelLabel>Visibility</PanelLabel>
                <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
                  {hist?.score ?? <NoValue />}
                </div>
              </div>
              <div>
                <PanelLabel>Rank</PanelLabel>
                <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
                  {hist?.rank ? `#${hist.rank}` : <NoValue />}
                </div>
              </div>
              <div>
                <PanelLabel>Models</PanelLabel>
                <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
                  {modelsWithChecks}/{AI_PLATFORMS_ACTIVE.length}
                </div>
              </div>
            </div>

            {(byPromptResult?.reportCount ?? 0) > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-vc-default pt-3 text-data text-vc-tertiary">
                <span>
                  {byPromptResult!.reportCount} report{byPromptResult!.reportCount === 1 ? "" : "s"}
                  {byPromptResult!.lastCheckedAt
                    ? ` · last run ${formatDistanceToNow(new Date(byPromptResult!.lastCheckedAt), { addSuffix: true })}`
                    : ""}
                </span>
                <CCLink
                  dest={{ to: "/monitor", search: { tab: "citations", ptab: "results" } }}
                  className="font-medium text-vc-accent hover:underline"
                >
                  Open report →
                </CCLink>
              </div>
            )}
          </div>

          {/* By model */}
          <div className="border-b border-vc-default py-6">
            <div className="px-8">
              <PanelLabel>By model</PanelLabel>
            </div>
            <PromptByModelTable byPlatform={byPlatform} rankMovement={rankMovement} />
          </div>

          {/* Sources cited */}
          <div className="border-b border-vc-default px-8 py-6">
            <div className="flex items-center justify-between">
              <PanelLabel>Sources cited ({sources.length})</PanelLabel>
              {sources.length > 0 && (
                <CCLink
                  dest={{ to: "/monitor", search: { tab: "citations", ptab: "results" } }}
                  className="text-data font-medium text-vc-accent hover:underline"
                >
                  Open in Citations →
                </CCLink>
              )}
            </div>
            {sources.length === 0 ? (
              <p className="mt-2 text-data text-vc-tertiary">No sources captured yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-vc-default">
                {(showAllSources ? sources : sources.slice(0, 10)).map((s) => (
                  <li key={s.url} className="flex items-center justify-between gap-3 py-2">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex min-w-0 items-center gap-1.5 truncate text-data text-vc-secondary hover:text-vc-accent"
                    >
                      <span className="truncate">{s.name ?? s.url}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      {s.ownSite && (
                        <span className="rounded bg-vc-accent-subtle px-1.5 py-0.5 text-label font-medium text-vc-accent">
                          Mentioned
                        </span>
                      )}
                      {s.type && (
                        <span className="rounded bg-vc-muted px-1.5 py-0.5 text-label capitalize text-vc-tertiary">
                          {s.type}
                        </span>
                      )}
                      <span className="text-data tabular-nums text-vc-tertiary">{s.count}×</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!showAllSources && sources.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllSources(true)}
                className="mt-2 text-data font-medium text-vc-accent hover:underline"
              >
                Show all {sources.length}
              </button>
            )}
          </div>

          {selectedBrandId && (
            <PhrasingsSection selectedBrandId={selectedBrandId} promptId={promptId} />
          )}

          {/* Details */}
          <div className="border-b border-vc-default px-8 py-6">
            <PanelLabel>Details</PanelLabel>
            <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-label text-vc-label">Intent</dt>
                <dd className="mt-0.5 text-caption text-vc-primary">{prompt.category ?? "–"}</dd>
              </div>
              <div>
                <dt className="text-label text-vc-label">Funnel stage</dt>
                <dd className="mt-0.5 text-caption text-vc-primary">{prompt.funnelStage ?? "–"}</dd>
              </div>
              <div>
                <dt className="text-label text-vc-label">Market</dt>
                <dd className="mt-0.5 text-caption text-vc-primary">{prompt.region}</dd>
              </div>
              <div>
                <dt className="text-label text-vc-label">Added</dt>
                <dd className="mt-0.5 text-caption text-vc-primary">
                  {new Date(prompt.createdAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>

          {/* Search Console */}
          <div className="border-b border-vc-default px-8 py-6">
            <p className="text-body text-vc-secondary">
              Connect Google Search Console to see where this prompt's intent already ranks on
              Google.
            </p>
            <CCLink
              dest={{ to: "/integrate" }}
              className="mt-2 inline-flex items-center gap-1 text-data font-medium text-vc-accent hover:text-vc-accent-hover"
            >
              Connect Search Console →
            </CCLink>
          </div>
        </>
      )}
    </PanelPage>
  );
}
