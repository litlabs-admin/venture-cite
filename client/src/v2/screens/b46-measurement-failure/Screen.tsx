import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/v2/shared/ui/EmptyState";
import { Panel } from "@/v2/shared/ui/Panel";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { VisibilityChart, type TodayVisibility } from "../b01-today/shared/TodayLayout";

export type Board46Data = {
  brandId: string;
  mode: "guided" | "expert";
  brand: { name: string };
  alert: {
    /** Failed calls in the current observation window - real, aggregate;
     *  there is no per-engine failure record to break this down further. */
    failedCount: number;
    observedCount: number;
    /** True when the brand's latest real observation is older than the
     *  14-day freshness window - see client/src/v2/today/staleness.ts. */
    isStale: boolean;
    staleAsOfLabel: string | null;
  };
  lastVerified: TodayVisibility;
};

export function Board46Screen({ data }: V2ScreenProps<Board46Data>) {
  const linkSearch = { brandId: data.brandId, mode: data.mode };
  const { alert, lastVerified } = data;

  const alertText =
    alert.isStale && alert.failedCount > 0
      ? `The latest measurement is ${alert.staleAsOfLabel ?? "out of date"}, and ${alert.failedCount} of ${alert.observedCount} recent attempts failed. Showing the last verified results below.`
      : alert.isStale
        ? `The latest measurement is ${alert.staleAsOfLabel ?? "out of date"}. Showing the last verified results below.`
        : `${alert.failedCount} of ${alert.observedCount} recent measurement attempts failed. Showing the last verified results below.`;

  return (
    <div
      className="flex min-h-full min-w-0 flex-col lg:flex-row"
      data-testid="board46-measurement-failure"
    >
      <main className="min-w-0 flex-1 px-7 py-6 xl:px-8">
        <PageHeader title="Some results need attention" className="mb-5" />

        <Panel padding="standard" className="mb-6 border-[var(--v2-warn)] bg-[var(--v2-inset)]">
          <div className="flex items-start gap-2.5">
            <V2Icon name="warn" size={17} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
            <div className="min-w-0">
              <h2 className={v2Type.bodyStrong}>Measurement needs attention</h2>
              <p className={`${v2Type.body} mt-1`}>{alertText}</p>
            </div>
          </div>
        </Panel>

        <section aria-labelledby="board46-failure-heading">
          <h2 id="board46-failure-heading" className={v2Type.sectionTitle}>
            Failure summary
          </h2>
          <p className={`${v2Type.body} mt-1`}>
            {alert.failedCount} of {alert.observedCount} attempts in the current window did not
            return an answer.
          </p>
          <EmptyState
            className="mt-3"
            icon="doc"
            title={<StateLabel state="not-measured" />}
            description="Which engine failed and why isn't recorded yet - only the total failed-attempt count is available today."
          />
        </section>

        <section className="mt-7 border-t border-[var(--v2-line)] pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={v2Type.sectionTitle}>Your last verified report</h2>
            {alert.isStale ? <StateLabel state="stale" /> : null}
          </div>
          {lastVerified.kind === "measured" ? (
            <>
              <p className={`${v2Type.body} mt-1.5`}>
                Brand mentioned in {lastVerified.mentioned} of {lastVerified.measured} successful
                test answers ·{" "}
                <span className="font-mono text-[13px] font-semibold tabular-nums text-[color:var(--v2-brand)]">
                  {lastVerified.mentionRate}%
                </span>{" "}
                · {lastVerified.rangeLabel}
              </p>
              <div className="mt-4 min-w-[240px]">
                <VisibilityChart data={lastVerified} />
              </div>
            </>
          ) : (
            <EmptyState
              className="mt-4 min-h-[190px]"
              title={<StateLabel state="not-measured" />}
              description="No verified report exists for this brand yet."
            />
          )}
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild className="h-10 rounded-lg px-4 text-[13.5px]">
            <Link to="/v2/visibility/results" search={linkSearch}>
              Review visibility results
            </Link>
          </Button>
          <Button asChild variant="ghost" className="h-10 rounded-lg px-4 text-[13.5px]">
            <Link to="/v2/diagnostics/site-health" search={linkSearch}>
              Review site health
            </Link>
          </Button>
        </div>
      </main>

      <aside
        aria-label="Measurement details"
        className="w-full shrink-0 space-y-5 border-t border-[var(--v2-line)] px-7 py-6 lg:w-[322px] lg:border-t-0 lg:border-l lg:px-6"
      >
        <section>
          <h3 className={v2Type.bodyStrong}>Engine-level detail</h3>
          <p className={`${v2Type.body} mt-2`}>
            <StateLabel state="not-measured" className="mb-1.5" />
          </p>
          <p className={v2Type.meta}>
            Which engines returned results and which failed isn&apos;t recorded per-engine today -
            only the totals above are available.
          </p>
        </section>
        <section className="border-t border-[var(--v2-line)] pt-5">
          <h3 className={v2Type.bodyStrong}>What stays true</h3>
          <ul className="mt-2 space-y-1.5">
            <li className={v2Type.body}>Every successful attempt is kept and used in results.</li>
            <li className={v2Type.body}>
              The last verified report above is never overwritten by a failed run.
            </li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
