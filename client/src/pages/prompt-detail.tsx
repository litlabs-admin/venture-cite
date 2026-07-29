import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Copy, Stethoscope } from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import {
  useAllPrompts,
  usePromptResults,
  usePromptScoreHistory,
  usePromptHistory,
} from "@/hooks/usePrompts";
import { EmptyState } from "@/components/ui/empty-state";

// ─── Prompt detail ───────────────────────────────────────────────────────────
// Its own page, not a sidebar — matching the reference, where clicking a
// prompt navigates to /prompts/p/:id. Route: /prompts/$promptId.
//
// Measured spec:
//   top bar     sticky, h-56, px-8, back link · "n of N" · prev/next · actions
//   title block px-8 pt-5 pb-5, breadcrumb → h1 (20px/600) → status chips
//   body        grid [minmax(0,1fr) 340px] at xl, aside hairline-left
//   visibility  px-8 py-6, hero figure 56px, stat columns divided by hairlines,
//               200px chart, footer line "N reports · last run …"
//   by model    grid-cols-[160px_56px_44px_minmax(0,1fr)], h-12 rows
//   aside       px-6 py-5 sections, label/value rows divided by hairlines
//
// NOT REPRODUCED, and why: the reference's "Volume /mo" (no search-volume
// source), its Intent and Audience detail rows (no such data), its Google
// Search Console panel (no integration), and its "Top answers" column, which
// lists the ranked entities the model named. We store the model's answer text
// but never parse a ranked entity list out of it, so that column shows the
// snippet we actually have instead of a fabricated ranking.

const RANGES = [
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const LOGOS: Record<string, string> = {
  ChatGPT: "/venturecite/images/ai-logos/chatgpt.svg",
  Claude: "/venturecite/images/ai-logos/claude.svg",
  Perplexity: "/venturecite/images/ai-logos/perplexity.svg",
  Gemini: "/venturecite/images/ai-logos/gemini.svg",
};

const SECTION_LABEL = "text-label font-semibold uppercase tracking-wider text-vc-label";

function Dash() {
  return <span className="tabular-nums text-vc-hover">–</span>;
}

/** Score-over-time chart. Plain SVG — the series is a handful of points and
 *  a charting library would be more code than the path. */
function ScoreChart({ series }: { series: { at: string; score: number }[] }) {
  if (series.length < 2) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center text-center">
        <p className="mb-1 text-body text-vc-tertiary">Not enough history yet</p>
        <p className="text-data text-vc-tertiary/80">
          {series.length === 0
            ? "This prompt has not been checked yet."
            : "One run recorded. A second one draws the trend."}
        </p>
      </div>
    );
  }
  const w = 900;
  const h = 200;
  const pad = { t: 12, r: 8, b: 22, l: 28 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const pts = series.map((p, i) => ({
    x: pad.l + (i / (series.length - 1)) * iw,
    y: pad.t + ih - (p.score / 100) * ih,
    ...p,
  }));
  const line = `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L")}`;
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${(pad.t + ih).toFixed(1)} L${pts[0].x.toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-[200px] w-full"
      role="img"
      aria-label="Score over time"
    >
      <defs>
        <linearGradient id="pdGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b5bf6" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#3b5bf6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((v) => {
        const y = pad.t + ih - (v / 100) * ih;
        return (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="#f5f5f4" strokeWidth="1" />
            <text
              x={pad.l - 6}
              y={y + 3}
              textAnchor="end"
              fontSize="10"
              fill="#a8a29e"
              fontFamily="JetBrains Mono, monospace"
            >
              {v}
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#pdGrad)" />
      <path d={line} fill="none" stroke="#3b5bf6" strokeWidth="1.5" strokeLinejoin="round" />
      {pts.map((p) => (
        <circle key={p.at} cx={p.x} cy={p.y} r="2.5" fill="#3b5bf6">
          <title>{`${fmt(p.at)} — ${p.score}`}</title>
        </circle>
      ))}
      <text x={pad.l} y={h - 6} fontSize="10" fill="#a8a29e" fontFamily="JetBrains Mono, monospace">
        {fmt(pts[0].at)}
      </text>
      <text
        x={w - pad.r}
        y={h - 6}
        textAnchor="end"
        fontSize="10"
        fill="#a8a29e"
        fontFamily="JetBrains Mono, monospace"
      >
        {fmt(pts[pts.length - 1].at)}
      </text>
    </svg>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-data text-vc-text-muted">{label}</span>
      <span className="min-w-0 text-right text-data text-vc-secondary">{value}</span>
    </div>
  );
}

export default function PromptDetailPage() {
  const { promptId } = useParams({ strict: false }) as { promptId: string };
  const navigate = useNavigate();
  const { selectedBrandId } = useBrandSelection();
  const [range, setRange] = useState<RangeKey>("30d");

  const { data: promptsData, isLoading: promptsLoading } = useAllPrompts(selectedBrandId);
  const { data: historyData } = usePromptScoreHistory(selectedBrandId);
  const { data: resultsData } = usePromptResults(selectedBrandId);
  const { data: runsData } = usePromptHistory(selectedBrandId);

  const prompts = useMemo(
    () => (promptsData?.data ?? []).filter((p) => p.status === "tracked"),
    [promptsData],
  );
  const prompt = (promptsData?.data ?? []).find((p) => p.id === promptId);
  const index = prompts.findIndex((p) => p.id === promptId);
  const history = (historyData?.data ?? []).find((h) => h.promptId === promptId);
  const result = (resultsData?.data?.byPrompt ?? []).find((r) => r.promptId === promptId);

  const series = useMemo(() => {
    const all = history?.series ?? [];
    const days = RANGES.find((r) => r.key === range)!.days;
    const cutoff = Date.now() - days * 86400000;
    return all.filter((p) => new Date(p.at).getTime() >= cutoff);
  }, [history, range]);

  if (promptsLoading) {
    return <div className="h-screen bg-white" />;
  }

  if (!prompt) {
    return (
      <div className="px-8 py-16">
        <EmptyState
          icon={Stethoscope}
          title="Prompt not found"
          description="It may have been archived, or it belongs to a different brand."
          action={{
            label: "Back to prompts",
            href: "/monitor?tab=citations&ptab=prompts",
            onClick: () => {},
          }}
        />
      </div>
    );
  }

  const platforms = result?.platforms ?? [];
  const mentioning = platforms.filter((p) => p.isCited).length;
  const rankByPlatform = new Map((history?.byPlatform ?? []).map((b) => [b.platform, b]));
  const go = (delta: number) => {
    const next = prompts[index + delta];
    if (next) void navigate({ to: "/prompts/$promptId", params: { promptId: next.id } });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-vc-default bg-white">
        <div className="flex h-[56px] items-center justify-between gap-3 px-8">
          <Link
            to="/monitor"
            search={{ tab: "citations", ptab: "prompts" } as never}
            className="inline-flex min-w-0 items-center gap-1.5 text-caption text-vc-secondary transition-colors hover:text-vc-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Prompts
          </Link>
          <div className="flex items-center gap-1">
            {index >= 0 && (
              <span className="mr-1 text-label tabular-nums text-vc-text-muted">
                {index + 1} of {prompts.length}
              </span>
            )}
            <button
              type="button"
              aria-label="Previous prompt"
              disabled={index <= 0}
              onClick={() => go(-1)}
              className="flex h-7 w-7 items-center justify-center rounded text-vc-text-muted transition-colors hover:bg-vc-muted hover:text-vc-primary disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next prompt"
              disabled={index < 0 || index >= prompts.length - 1}
              onClick={() => go(1)}
              className="flex h-7 w-7 items-center justify-center rounded text-vc-text-muted transition-colors hover:bg-vc-muted hover:text-vc-primary disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="mx-2 h-3.5 w-px bg-vc-default" aria-hidden />
            <Link
              to="/diagnose"
              search={{ tab: "signals" } as never}
              className="flex h-8 items-center gap-1.5 rounded border border-vc-default px-2.5 text-caption font-medium text-vc-secondary transition-colors hover:bg-vc-muted/50"
            >
              <Stethoscope className="h-3.5 w-3.5" aria-hidden />
              Diagnose
            </Link>
          </div>
        </div>
      </div>

      {/* Title block */}
      <div className="border-b border-vc-default px-8 pb-5 pt-5">
        <nav className="mb-3 overflow-hidden">
          <ol className="flex min-w-0 items-center gap-1.5 text-caption text-vc-text-muted">
            <li>
              <Link
                to="/monitor"
                search={{ tab: "citations", ptab: "prompts" } as never}
                className="truncate text-vc-secondary transition-colors hover:text-vc-primary"
              >
                Prompts
              </Link>
            </li>
            <li className="flex min-w-0 items-center gap-1.5">
              <ChevronRight className="h-3 w-3" aria-hidden />
              <span className="truncate font-medium text-vc-primary">Prompt detail</span>
            </li>
          </ol>
        </nav>
        <div className="group mb-3 flex items-start gap-2.5">
          <h1 className="max-w-[900px] text-[20px] font-semibold leading-snug tracking-tight text-vc-primary">
            {prompt.prompt}
          </h1>
          <button
            type="button"
            aria-label="Copy prompt"
            onClick={() => void navigator.clipboard?.writeText(prompt.prompt)}
            className="mt-0.5 shrink-0 rounded p-1 text-vc-text-muted opacity-0 transition-all hover:bg-vc-accent-subtle hover:text-vc-accent focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Copy className="h-3 w-3" aria-hidden />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-6 items-center gap-1.5 rounded border border-vc-default bg-white px-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                prompt.status === "tracked" ? "bg-vc-accent" : "bg-vc-hover"
              }`}
              aria-hidden
            />
            <span className="text-label font-medium text-vc-secondary">
              {prompt.status === "tracked" ? "Tracking" : "Paused"}
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0">
          {/* Visibility */}
          <section className="border-b border-vc-default px-8 py-6">
            <div className="flex items-center justify-between">
              <h3 className={SECTION_LABEL}>Visibility</h3>
              <div className="inline-flex h-7 items-center rounded border border-vc-default bg-white p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRange(r.key)}
                    className={`h-full rounded-[3px] px-2 text-caption font-medium transition-colors ${
                      range === r.key
                        ? "bg-vc-accent-subtle text-vc-accent"
                        : "text-vc-secondary hover:bg-vc-muted/40 hover:text-vc-primary"
                    }`}
                  >
                    {r.key}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-y-4">
              <div className="flex items-baseline gap-3 pr-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-[56px] font-semibold leading-none tracking-tight tabular-nums text-vc-primary">
                    {history?.score ?? "–"}
                  </span>
                  <span className="text-[14px] font-medium leading-none text-vc-text-muted">
                    /100
                  </span>
                </div>
                {history?.delta !== null && history?.delta !== undefined && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-caption font-medium tabular-nums ${
                      history.delta > 0
                        ? "text-positive"
                        : history.delta < 0
                          ? "text-destructive"
                          : "text-vc-tertiary"
                    }`}
                  >
                    {history.delta > 0 ? "+" : ""}
                    {history.delta}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5 border-l border-vc-subtle pl-6 pr-6">
                <span className="text-label text-vc-text-muted">Rank</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[24px] font-semibold leading-none tracking-tight tabular-nums text-vc-primary">
                    {history?.rank !== null && history?.rank !== undefined
                      ? `#${history.rank}`
                      : "–"}
                  </span>
                  <span className="text-label text-vc-text-muted">avg</span>
                </div>
              </div>

              {/* No search-volume source exists — a dash, never a number. */}
              <div className="flex flex-col gap-1.5 border-l border-vc-subtle pl-6 pr-6">
                <span className="text-label text-vc-text-muted">Volume</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[24px] font-semibold leading-none tracking-tight text-vc-hover">
                    –
                  </span>
                  <span className="text-label text-vc-text-muted">/mo</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-l border-vc-subtle pl-6">
                <span className="text-label text-vc-text-muted">Models</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[24px] font-semibold leading-none tracking-tight tabular-nums text-vc-primary">
                    {platforms.length ? `${mentioning}/${platforms.length}` : "–"}
                  </span>
                  <span className="text-label text-vc-text-muted">mention you</span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <ScoreChart series={series} />
            </div>

            <div className="mt-3 flex items-center justify-between text-data text-vc-text-muted">
              <span>
                {history?.runs ?? 0} report{(history?.runs ?? 0) === 1 ? "" : "s"}
                {history?.lastRunAt
                  ? ` · last run ${new Date(history.lastRunAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}`
                  : ""}
              </span>
              <Link
                to="/report"
                className="inline-flex items-center gap-0.5 text-vc-secondary transition-colors hover:text-vc-accent"
              >
                Open report
                <ChevronRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
          </section>

          {/* By model */}
          <section className="border-b border-vc-default">
            <div className="flex items-center justify-between px-8 pb-3 pt-6">
              <h3 className={SECTION_LABEL}>By model</h3>
              {platforms[0]?.checkedAt && (
                <span className="text-label tabular-nums text-vc-text-muted">
                  Latest run ·{" "}
                  {new Date(platforms[0].checkedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
            <div className="border-t border-vc-subtle">
              <div className="grid h-8 grid-cols-[160px_56px_44px_minmax(0,1fr)] items-center gap-3 border-b border-vc-subtle px-8">
                <span className={SECTION_LABEL}>Model</span>
                <span className={SECTION_LABEL}>Rank</span>
                <span className={SECTION_LABEL}>Δ</span>
                <span className={SECTION_LABEL}>What it said</span>
              </div>
              {platforms.length === 0 ? (
                <p className="px-8 py-6 text-caption text-vc-tertiary">
                  No results yet. Run a citation check to see how each model answers.
                </p>
              ) : (
                platforms.map((pl) => {
                  const rb = rankByPlatform.get(pl.platform);
                  return (
                    <div
                      key={pl.platform}
                      className="group grid h-12 grid-cols-[160px_56px_44px_minmax(0,1fr)] items-center gap-3 border-b border-vc-subtle px-8 transition-colors hover:bg-vc-muted/50"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {LOGOS[pl.platform] ? (
                          <img
                            src={LOGOS[pl.platform]}
                            alt=""
                            className="h-[18px] w-[18px] rounded object-contain"
                          />
                        ) : (
                          <span className="flex h-[18px] w-[18px] items-center justify-center rounded bg-vc-muted text-[9px] font-semibold text-vc-secondary">
                            {pl.platform.charAt(0)}
                          </span>
                        )}
                        <span className="truncate text-body font-medium text-vc-primary">
                          {pl.platform}
                        </span>
                      </div>
                      <div>
                        {pl.rank ? (
                          <span className="inline-flex h-5 min-w-[30px] items-center justify-center rounded border border-vc-default bg-white px-1.5 text-data font-semibold tabular-nums text-vc-secondary">
                            #{pl.rank}
                          </span>
                        ) : pl.isCited ? (
                          <span
                            className="text-data font-medium text-vc-accent"
                            title="Cited, but this run recorded no placement"
                          >
                            cited
                          </span>
                        ) : (
                          <Dash />
                        )}
                      </div>
                      <div>
                        {rb?.isNew ? (
                          <span className="text-label font-semibold uppercase tracking-wider text-vc-accent">
                            new
                          </span>
                        ) : rb?.rankDelta !== null && rb?.rankDelta !== undefined ? (
                          <span
                            className={`text-data font-medium tabular-nums ${
                              rb.rankDelta < 0
                                ? "text-positive"
                                : rb.rankDelta > 0
                                  ? "text-destructive"
                                  : "text-vc-tertiary"
                            }`}
                          >
                            {rb.rankDelta > 0 ? "+" : ""}
                            {rb.rankDelta}
                          </span>
                        ) : (
                          <Dash />
                        )}
                      </div>
                      <div className="min-w-0 overflow-hidden">
                        {pl.snippet ? (
                          <p className="truncate text-data text-vc-secondary" title={pl.snippet}>
                            {pl.snippet}
                          </p>
                        ) : (
                          <span className="text-data text-vc-hover">
                            {pl.isCited ? "No excerpt stored" : "Not mentioned"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </main>

        {/* Aside */}
        <aside className="border-t border-vc-default xl:border-l xl:border-t-0">
          <section className="border-b border-vc-subtle px-6 py-5">
            <h3 className={SECTION_LABEL}>Details</h3>
            <div className="mt-2 divide-y divide-vc-subtle">
              <DetailRow
                label="Status"
                value={prompt.status === "tracked" ? "Tracking" : "Paused"}
              />
              <DetailRow label="Market" value={prompt.region || "global"} />
              <DetailRow
                label="Source"
                value={prompt.generationId ? "Generated" : "Added manually"}
              />
              <DetailRow
                label="Added"
                value={
                  prompt.createdAt
                    ? new Date(prompt.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "–"
                }
              />
            </div>
          </section>

          <section className="px-6 py-5">
            <h3 className={SECTION_LABEL}>Activity</h3>
            <div className="mt-3 space-y-2">
              {(runsData?.data ?? [])
                .filter((r) => (r.status ?? "succeeded") === "succeeded")
                .slice(0, 6)
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="truncate text-data text-vc-secondary">
                      Scored in run · {r.citationRate}% cited
                    </span>
                    <span className="shrink-0 text-label tabular-nums text-vc-text-muted">
                      {new Date(r.startedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                ))}
              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-data text-vc-secondary">Prompt added</span>
                <span className="shrink-0 text-label tabular-nums text-vc-text-muted">
                  {prompt.createdAt
                    ? new Date(prompt.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    : "–"}
                </span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
