import { Link } from "@tanstack/react-router";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useAssignedTasks, useWorkSummary, type WorkSummaryView } from "../data/workSummary";
import { useVisibilityTrend, type VisibilityWeek } from "../data/visibilityTrend";
import { PriorityTask, QueuedTaskRow } from "./PriorityTask";
import { ProgressRail } from "./ProgressRail";
import { ObservedVisibility } from "./ObservedVisibility";

// Today - composition only.
//
// The four states below are not an afterthought bolted onto a happy path:
// loading, error, empty and zero-brand are all reachable in this tree, which
// AuthenticatedBareRoute leaves un-redirected, and each brand in the fixture
// set lands on a different one. Every branch renders the same two-column
// frame so the screen never jumps as data arrives.

const COLUMN = "min-w-0 flex-1 px-8 py-6";
const RAIL = "hidden w-[322px] shrink-0 border-l border-vc-default px-6 py-6 xl:block";

function Frame({ main, rail }: { main: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-stretch">
      <div className={COLUMN}>{main}</div>
      <aside className={RAIL} aria-label="Your progress">
        {rail}
      </aside>
    </div>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-vc-muted ${className}`} aria-hidden="true" />;
}

function LoadingToday() {
  return (
    <div data-testid="v2-today-loading" role="status" aria-busy="true">
      <span className="sr-only">Loading today</span>
      <Frame
        main={
          <>
            <Bar className="h-7 w-72" />
            <Bar className="mt-3 h-4 w-96" />
            <div className="mt-6 flex gap-3">
              <Bar className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <Bar className="h-5 w-80" />
                <Bar className="mt-3 h-4 w-64" />
                <Bar className="mt-3 h-4 w-full max-w-lg" />
                <Bar className="mt-4 h-8 w-40" />
              </div>
            </div>
            <Bar className="mt-8 h-12 w-full" />
            <Bar className="mt-3 h-12 w-full" />
            <Bar className="mt-8 h-[220px] w-full" />
          </>
        }
        rail={
          <>
            <Bar className="h-4 w-28" />
            <Bar className="mt-4 h-12 w-12 rounded-md" />
            <Bar className="mt-4 h-1.5 w-full" />
            <Bar className="mt-6 h-4 w-40" />
            <Bar className="mt-3 h-4 w-32" />
            <Bar className="mt-8 h-20 w-full" />
          </>
        }
      />
    </div>
  );
}

/** No brands at all. The shell's context bar says the same thing in one line;
 *  the page must still say it here, or the screen reads as broken rather than
 *  as new. */
function NoBrand() {
  return (
    <Frame
      main={
        <div data-testid="v2-today-no-brand" className="max-w-lg">
          <h1 className="text-metric font-semibold text-vc-primary">Add a brand to start</h1>
          <p className="mt-2 text-body text-vc-secondary">
            Work is ranked per brand, and there is no brand on this account yet. Add one and the
            first useful step appears here.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/welcome">Add a brand</Link>
          </Button>
        </div>
      }
      rail={<p className="text-body text-vc-secondary">Progress starts with your first brand.</p>}
    />
  );
}

/** A brand exists but nothing has been ranked for it yet. Distinct from the
 *  zero-brand case above, and never rendered as a zero. */
function EmptyToday({ brandName }: { brandName: string }) {
  return (
    <Frame
      main={
        <div data-testid="v2-today-empty" className="max-w-lg">
          <h1 className="text-metric font-semibold text-vc-primary">Nothing to do yet</h1>
          <p className="mt-2 text-body text-vc-secondary">
            No work has been ranked for {brandName}. The queue fills once the brand has been read
            and measured for the first time.
          </p>
        </div>
      }
      rail={
        <p className="text-body text-vc-secondary">
          Progress appears here once the first task is ranked.
        </p>
      }
    />
  );
}

function PopulatedToday({
  summary,
  queued,
  weeks,
  weeksFailed,
  weeksLoading,
}: {
  summary: WorkSummaryView;
  queued: WorkSummaryView["waitingTasks"];
  weeks: VisibilityWeek[] | undefined;
  weeksFailed: boolean;
  weeksLoading: boolean;
}) {
  const nextTask = summary.nextTask;

  return (
    <Frame
      main={
        <div data-testid="v2-today-populated">
          <h1 className="text-metric font-semibold leading-tight text-vc-primary">
            Your next useful step
          </h1>
          {summary.goal && (
            <p className="mt-1 text-body text-vc-secondary">
              <span className="text-vc-tertiary">Goal: </span>
              {summary.goal.statement}
            </p>
          )}

          <div className="mt-5">
            {nextTask ? (
              <PriorityTask task={nextTask} />
            ) : (
              <p className="border-b border-vc-default pb-6 text-body text-vc-secondary">
                No task is ranked first right now.
              </p>
            )}
          </div>

          {queued.map((task) => (
            <QueuedTaskRow key={task.id} task={task} />
          ))}

          {weeksFailed ? (
            <p className="pt-6 text-body text-vc-tertiary" data-testid="v2-visibility-failed">
              Visibility could not be loaded. The rest of this screen is unaffected.
            </p>
          ) : weeksLoading ? (
            // Not `weeks ?? []`: an empty series renders "Not measured", and
            // flashing that at a brand that IS measured is a false statement,
            // however briefly it is on screen.
            <div className="pt-6" data-testid="v2-visibility-loading">
              <Bar className="h-3 w-40" />
              <Bar className="mt-3 h-4 w-80" />
              <Bar className="mt-4 h-[220px] w-full" />
            </div>
          ) : (
            <ObservedVisibility weeks={weeks ?? []} />
          )}
        </div>
      }
      rail={<ProgressRail summary={summary} />}
    />
  );
}

export default function TodayPage() {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const summaryQuery = useWorkSummary(selectedBrandId);
  const tasksQuery = useAssignedTasks(selectedBrandId);
  const trendQuery = useVisibilityTrend(selectedBrandId);

  if (brandsLoading) return <LoadingToday />;
  if (!selectedBrandId) return <NoBrand />;
  if (summaryQuery.isPending || tasksQuery.isPending) return <LoadingToday />;

  if (summaryQuery.isError || tasksQuery.isError) {
    return (
      <Frame
        main={
          <div data-testid="v2-today-error">
            <ErrorState
              title="Today could not be loaded"
              description="The work queue for this brand did not load. Nothing has been lost - try again."
              onRetry={() => {
                void summaryQuery.refetch();
                void tasksQuery.refetch();
              }}
              isRetrying={summaryQuery.isFetching || tasksQuery.isFetching}
            />
          </div>
        }
        rail={<p className="text-body text-vc-secondary">Progress is unavailable right now.</p>}
      />
    );
  }

  const summary = summaryQuery.data;
  // The first row of the assigned list IS `nextTask` - both come from the same
  // ranking - so the rows under the lead task start after it.
  const queued = (tasksQuery.data?.items ?? [])
    .filter((task) => task.id !== summary.nextTask?.id)
    .slice(0, 2);

  if (!summary.nextTask && queued.length === 0 && summary.waitingTasks.length === 0) {
    return <EmptyToday brandName={selectedBrand?.name ?? "this brand"} />;
  }

  return (
    <PopulatedToday
      summary={summary}
      queued={queued}
      weeks={trendQuery.data?.weeks}
      weeksFailed={trendQuery.isError}
      weeksLoading={trendQuery.isPending}
    />
  );
}
