import { useMemo, useState } from "react";
import { ChevronDown, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { PanelLabel } from "@/components/dashboard-panels/primitives";

// ─── Perception probe matrix ────────────────────────────────────────────────
// Renders the result of ASKING each engine directly (server/lib/
// perceptionProbes.ts) rather than inferring perception from citation answers.
//
// The whole point of this view is that it is NOT one blended number: each cell
// is one engine's verdict on one axis, and the disagreements between engines
// are the finding. A cell therefore renders in one of four honestly-distinct
// states, and they must never collapse into each other:
//
//   score       the engine answered and the judge scored it
//   no info     the engine said it has no reliable information on this brand.
//               NOT a low score - "nobody has heard of you" and "people think
//               poorly of you" are opposite findings with opposite fixes.
//   failed      the call or the scoring errored. A hole in the data, labelled.
//   pending     not asked yet (run still in flight)

export const PROBE_AXES = [
  ["trust", "Trust"],
  ["quality", "Quality"],
  ["value", "Value"],
  ["market", "Market"],
  ["innovation", "Innovation"],
] as const;

export interface Probe {
  platform: string;
  axis: string;
  question: string;
  status: string;
  answer: string | null;
  sources: Array<{ url: string }>;
  score: number | null;
  noInformation: boolean;
  note: string | null;
  errorMessage: string | null;
}

export interface ProbeRun {
  runId: string;
  status: string;
  probesDone: number;
  probesTotal: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  probes: Probe[];
}

/** Warm for high, cool for low - but only ever applied to a real score, so a
 *  "no information" cell can never be mistaken for a bad one. */
function scoreTone(score: number): string {
  if (score >= 75) return "text-vc-accent";
  if (score >= 50) return "text-vc-primary";
  return "text-vc-danger";
}

function CellButton({
  probe,
  selected,
  onSelect,
}: {
  probe: Probe | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const base =
    "flex h-full w-full flex-col items-center justify-center gap-0.5 rounded border px-2 py-3 text-center transition-colors";
  const ring = selected ? "border-vc-accent bg-vc-accent-subtle" : "border-vc-default";

  if (!probe || probe.status === "pending") {
    return (
      <div className={`${base} border-dashed border-vc-default`}>
        <span className="text-label text-vc-hover">—</span>
      </div>
    );
  }
  if (probe.status === "failed") {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`${base} ${ring} hover:border-vc-accent`}
        title={probe.errorMessage ?? "This probe failed"}
      >
        <AlertCircle className="h-3.5 w-3.5 text-vc-danger" aria-hidden />
        <span className="text-label uppercase tracking-wider text-vc-tertiary">Failed</span>
      </button>
    );
  }
  if (probe.noInformation) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`${base} ${ring} hover:border-vc-accent`}
        title={probe.note ?? "This engine had no reliable information"}
      >
        <span className="text-data font-medium text-vc-tertiary">No info</span>
        <span className="text-label text-vc-hover">not scored</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onSelect} className={`${base} ${ring} hover:border-vc-accent`}>
      <span
        className={`text-page font-semibold leading-none tabular-nums ${scoreTone(probe.score ?? 0)}`}
      >
        {(probe.score ?? 0).toFixed(1)}
      </span>
    </button>
  );
}

/** Cross-engine average for one axis, over the engines that actually scored it.
 *  Engines that returned "no information" are EXCLUDED rather than counted as
 *  zero - averaging in a non-answer would manufacture a bad score out of
 *  silence. Returns null when no engine scored the axis at all. */
export function axisAverage(probes: Probe[], axis: string): number | null {
  const scored = probes.filter(
    (p) => p.axis === axis && p.status === "scored" && !p.noInformation && p.score !== null,
  );
  if (scored.length === 0) return null;
  return scored.reduce((sum, p) => sum + (p.score ?? 0), 0) / scored.length;
}

export function ProbeMatrix({
  run,
  onRun,
  running,
  error,
}: {
  run: ProbeRun | null;
  onRun: () => void;
  running: boolean;
  error: string | null;
}) {
  const [selected, setSelected] = useState<{ platform: string; axis: string } | null>(null);

  const platforms = useMemo(() => {
    if (!run) return [];
    const seen: string[] = [];
    for (const p of run.probes) if (!seen.includes(p.platform)) seen.push(p.platform);
    return seen;
  }, [run]);

  const byCell = useMemo(() => {
    const m = new Map<string, Probe>();
    for (const p of run?.probes ?? []) m.set(`${p.platform}|${p.axis}`, p);
    return m;
  }, [run]);

  const selectedProbe = selected ? byCell.get(`${selected.platform}|${selected.axis}`) : undefined;
  const inFlight = running || run?.status === "pending" || run?.status === "running";

  const runButton = (
    <button
      type="button"
      onClick={onRun}
      disabled={inFlight}
      className="inline-flex items-center gap-1.5 rounded bg-vc-accent-subtle px-3 py-1.5 text-data font-medium text-vc-accent transition-all hover:bg-vc-accent hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      {inFlight ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="h-3 w-3" aria-hidden />
      )}
      {inFlight
        ? `Asking engines… ${run?.probesDone ?? 0}/${run?.probesTotal ?? 30}`
        : run
          ? "Ask again"
          : "Ask the engines"}
    </button>
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <PanelLabel>Asked Directly</PanelLabel>
          <p className="mt-1 max-w-2xl text-data text-vc-label">
            Each engine is asked five questions about this brand — one per axis — with live web
            search, and scored on its own answers. Separate from the score above, which is inferred
            from answers to your tracked prompts.
          </p>
        </div>
        {runButton}
      </div>

      {error && <p className="mt-3 text-data text-vc-danger">{error}</p>}

      {!run ? (
        <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded border border-dashed border-vc-default py-12 text-center">
          <p className="text-body text-vc-tertiary">
            No engine has been asked about this brand yet.
          </p>
          <p className="text-data text-vc-hover">
            A full pass asks 6 engines 5 questions each and takes a minute or two.
          </p>
        </div>
      ) : (
        <>
          {/* Matrix. Engines down, axes across - reading a ROW tells you what
              one engine thinks; reading a COLUMN tells you where engines
              disagree. */}
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[620px]">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `120px repeat(${PROBE_AXES.length}, 1fr)` }}
              >
                <div />
                {PROBE_AXES.map(([key, label]) => (
                  <div
                    key={key}
                    className="pb-1 text-center text-label uppercase tracking-wider text-vc-label"
                  >
                    {label}
                  </div>
                ))}

                {platforms.map((platform) => (
                  <FragmentRow
                    key={platform}
                    platform={platform}
                    byCell={byCell}
                    selected={selected}
                    onSelect={setSelected}
                  />
                ))}

                {/* Cross-engine average, over scoring engines only. */}
                <div className="flex items-center pt-2 text-label uppercase tracking-wider text-vc-label">
                  Average
                </div>
                {PROBE_AXES.map(([key]) => {
                  const avg = axisAverage(run.probes, key);
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-center pt-2 text-data font-semibold tabular-nums text-vc-primary"
                      title="Averaged over the engines that scored this axis. Engines with no information are excluded, never counted as zero."
                    >
                      {avg === null ? <span className="text-vc-hover">—</span> : avg.toFixed(1)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {run.status === "partial" && (
            <p className="mt-3 text-data text-vc-tertiary">
              Some probes failed on this run. The cells that landed are shown; the failures are
              marked rather than filled in.
            </p>
          )}

          {/* Detail for the selected cell: the exact question, the engine's own
              answer, and what drove the score. */}
          {selectedProbe && (
            <div className="mt-4 rounded border border-vc-default p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-label uppercase tracking-wider text-vc-label">
                    {selectedProbe.platform} · {selectedProbe.axis}
                  </span>
                  <p className="mt-2 text-data font-medium text-vc-primary">
                    {selectedProbe.question}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="shrink-0 text-vc-tertiary hover:text-vc-primary"
                  aria-label="Close detail"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
              </div>

              {selectedProbe.note && (
                <p className="mt-4 border-l-2 border-vc-accent/40 pl-3 text-data text-vc-label">
                  {selectedProbe.note}
                </p>
              )}
              {selectedProbe.errorMessage && (
                <p className="mt-4 text-data text-vc-danger">{selectedProbe.errorMessage}</p>
              )}

              {selectedProbe.answer && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-data text-vc-tertiary hover:text-vc-primary">
                    Read {selectedProbe.platform}&rsquo;s full answer
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap text-data leading-relaxed text-vc-label">
                    {selectedProbe.answer}
                  </p>
                </details>
              )}

              {selectedProbe.sources.length > 0 && (
                <div className="mt-4">
                  <span className="text-label uppercase tracking-wider text-vc-label">
                    Sources it grounded on
                  </span>
                  <ul className="mt-2 space-y-1">
                    {selectedProbe.sources.slice(0, 8).map((s) => (
                      <li key={s.url} className="truncate text-data">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-vc-accent hover:underline"
                        >
                          {s.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One engine's row. Split out so the grid stays a flat child list - nesting a
 *  wrapper div here would break the CSS grid's column alignment. */
function FragmentRow({
  platform,
  byCell,
  selected,
  onSelect,
}: {
  platform: string;
  byCell: Map<string, Probe>;
  selected: { platform: string; axis: string } | null;
  onSelect: (cell: { platform: string; axis: string }) => void;
}) {
  return (
    <>
      <div className="flex items-center text-data font-medium text-vc-primary">{platform}</div>
      {PROBE_AXES.map(([axis]) => (
        <CellButton
          key={axis}
          probe={byCell.get(`${platform}|${axis}`)}
          selected={selected?.platform === platform && selected?.axis === axis}
          onSelect={() => onSelect({ platform, axis })}
        />
      ))}
    </>
  );
}
