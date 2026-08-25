import { useCallback, useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { apiRequest } from "@/lib/queryClient";
import { PanelPage } from "@/components/dashboard-panels/Panel";
import { PanelLabel, NoValue, CCLink } from "@/components/dashboard-panels/primitives";

// ─── Per-question diagnosis ──────────────────────────────────────────────────
// "Why are we not winning this question?" for one tracked prompt.
//
// The counted sections (standing, rivals, sources) come straight from stored
// citation results. The verdict and fixes are written by a model that sees only
// those counts - see server/lib/promptDiagnose.ts. When that narrative half is
// missing the page says why and still renders the measured half, because the
// numbers are what the page is actually for.

interface Rival {
  name: string;
  timesNamed: number;
  bestRank: number | null;
  namedWhileWeWereAbsent: number;
}
interface Source {
  url: string;
  domain: string | null;
  timesCited: number;
  timesCitedWithUs: number;
  isOwnDomain: boolean;
}
interface Diagnosis {
  prompt: { id: string; text: string; category: string | null; funnelStage: string | null };
  standing: {
    score: number | null;
    rank: number | null;
    modelsCited: number;
    modelsChecked: number;
    modelsTotal: number;
    responsesAnalysed: number;
    lastCheckedAt: string | null;
  };
  rivals: Rival[];
  sources: Source[];
  ownDomain: string | null;
  verdict: string | null;
  fixes: Array<{ title: string; detail: string }>;
  narrativeError: string | null;
}

export default function PromptDiagnosePage() {
  const { promptId } = useParams({ from: "/_app/prompts/$promptId/diagnose" });
  const { selectedBrandId } = useBrandSelection();
  const [data, setData] = useState<Diagnosis | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");

  const run = useCallback(async () => {
    if (!selectedBrandId) return;
    setState("loading");
    try {
      const res = await apiRequest(
        "GET",
        `/api/brand-prompts/${selectedBrandId}/prompts/${promptId}/diagnose`,
      );
      const body = await res.json();
      if (!body.success) throw new Error(body.error ?? "failed");
      setData(body.data as Diagnosis);
      setState("ok");
    } catch {
      // Never render a half-empty report as though it were a finding.
      setState("failed");
    }
  }, [selectedBrandId, promptId]);

  useEffect(() => {
    void run();
  }, [run]);

  if (!selectedBrandId) return null;

  return (
    <PanelPage>
      <div className="flex items-center justify-between border-b border-vc-default px-8 py-4">
        <CCLink
          dest={{ to: `/prompts/${promptId}` }}
          className="flex items-center gap-1.5 text-data text-vc-tertiary hover:text-vc-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to prompt
        </CCLink>
        <button
          type="button"
          onClick={() => void run()}
          disabled={state === "loading"}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-vc-default px-2.5 text-data text-vc-secondary transition-colors hover:border-vc-hover hover:text-vc-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
          Re-run
        </button>
      </div>

      {state === "loading" && !data && (
        <div className="space-y-px">
          <div className="h-28 w-full animate-pulse bg-vc-muted/40" />
          <div className="h-40 w-full animate-pulse bg-vc-muted/40" />
        </div>
      )}

      {state === "failed" && (
        <div className="px-8 py-16 text-center">
          <p className="text-body text-vc-primary">Could not run the diagnosis.</p>
          <p className="mt-1 text-data text-vc-tertiary">
            Nothing is shown rather than a partial report that could read as a finding.
          </p>
          <button
            type="button"
            onClick={() => void run()}
            className="mt-3 h-8 rounded-md bg-vc-accent px-3 text-data font-medium text-white hover:bg-vc-accent-hover"
          >
            Try again
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="border-b border-vc-default px-8 py-6">
            <PanelLabel>Diagnosis</PanelLabel>
            <h1 className="mt-1 text-page font-semibold text-vc-primary">{data.prompt.text}</h1>

            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-vc-default pt-4 sm:grid-cols-4">
              <Stat label="Visibility" value={data.standing.score ?? null} />
              <Stat label="Rank" value={data.standing.rank ? `#${data.standing.rank}` : null} />
              <Stat
                label="Models citing"
                value={`${data.standing.modelsCited}/${data.standing.modelsChecked || data.standing.modelsTotal}`}
              />
              <Stat label="Rivals named" value={data.rivals.length || null} />
            </div>
          </div>

          {/* Verdict */}
          <div className="border-b border-vc-default px-8 py-6">
            <PanelLabel>What's happening</PanelLabel>
            {data.verdict ? (
              <p className="mt-2 max-w-prose text-body leading-relaxed text-vc-secondary">
                {data.verdict}
              </p>
            ) : (
              <p className="mt-2 flex items-start gap-2 text-data text-vc-tertiary">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                {data.narrativeError ?? "No written analysis for this question yet."}
              </p>
            )}
          </div>

          {/* Fixes */}
          {data.fixes.length > 0 && (
            <div className="border-b border-vc-default px-8 py-6">
              <PanelLabel>What to do</PanelLabel>
              <ol className="mt-3 space-y-3">
                {data.fixes.map((f, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-vc-accent-subtle font-mono text-label font-semibold text-vc-accent">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-caption font-medium text-vc-primary">{f.title}</p>
                      {f.detail && (
                        <p className="mt-0.5 text-data leading-relaxed text-vc-tertiary">
                          {f.detail}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Rivals */}
          <div className="border-b border-vc-default px-8 py-6">
            <PanelLabel>Who wins this question instead ({data.rivals.length})</PanelLabel>
            {data.rivals.length === 0 ? (
              <p className="mt-2 text-data text-vc-tertiary">
                No rival brand was named in the answers we captured.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-data">
                  <thead>
                    <tr className="border-b border-vc-default text-label uppercase tracking-wider text-vc-label">
                      <th className="py-1.5 text-left font-semibold">Brand</th>
                      <th className="py-1.5 text-right font-semibold">Answers naming them</th>
                      <th className="py-1.5 text-right font-semibold">Best position</th>
                      <th className="py-1.5 text-right font-semibold">Named without us</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-vc-default">
                    {data.rivals.slice(0, 15).map((r) => (
                      <tr key={r.name}>
                        <td className="py-2 text-vc-primary">{r.name}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-vc-secondary">
                          {r.timesNamed}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-vc-secondary">
                          {r.bestRank ? `#${r.bestRank}` : <NoValue />}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-vc-secondary">
                          {r.namedWhileWeWereAbsent}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sources */}
          <div className="px-8 py-6">
            <PanelLabel>Sources the models lean on ({data.sources.length})</PanelLabel>
            <p className="mt-1 text-data text-vc-tertiary">
              A source cited many times that never appears alongside you is where the answer is
              being formed without you.
            </p>
            {data.sources.length === 0 ? (
              <p className="mt-2 text-data text-vc-tertiary">No sources were captured.</p>
            ) : (
              <ul className="mt-3 divide-y divide-vc-default">
                {data.sources.slice(0, 15).map((s) => {
                  const gap = s.timesCitedWithUs === 0 && !s.isOwnDomain;
                  return (
                    <li key={s.url} className="flex items-center justify-between gap-3 py-2">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex min-w-0 items-center gap-1.5 truncate text-data text-vc-secondary hover:text-vc-accent"
                      >
                        <span className="truncate">{s.domain ?? s.url}</span>
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                      <span className="flex flex-shrink-0 items-center gap-2">
                        {s.isOwnDomain && (
                          <span className="rounded bg-vc-accent-subtle px-1.5 py-0.5 text-label font-medium text-vc-accent">
                            Your site
                          </span>
                        )}
                        {gap && (
                          <span className="rounded bg-vc-muted px-1.5 py-0.5 text-label font-medium text-vc-tertiary">
                            Never with you
                          </span>
                        )}
                        <span className="font-mono text-data tabular-nums text-vc-tertiary">
                          {s.timesCited}×
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </PanelPage>
  );
}

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <PanelLabel>{label}</PanelLabel>
      <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
        {value === null || value === undefined ? <NoValue /> : value}
      </div>
    </div>
  );
}
