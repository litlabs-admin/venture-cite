import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useWorkSummary } from "../data/workSummary";
import { TASK_PAGE_LIMIT, useWorkTask, useWorkTasks } from "../data/workTasks";
import { TaskDetail, TaskDetailRail } from "./TaskDetail";
import { TaskPreview } from "./TaskPreview";
import { WorkTable } from "./WorkTable";
import { bucketTasks, TAB_ORDER, type TabId } from "./taskBuckets";

// My work - composition only.
//
// `/v2/my-work` is the list; `/v2/my-work?task=<id>` is one task. Both are the
// same route, because they are the same screen with the same rail, and a
// second route would remount the shell around a state change the user reads as
// "open this row".
//
// Loading, error, empty and zero-brand are all reachable here: the tree is
// gated by `AuthenticatedBareRoute`, which does not redirect a brand-less
// account away. Every branch renders the same two-column frame so the screen
// does not jump as data arrives.

const COLUMN = "min-w-0 flex-1 px-8 py-6";
const RAIL =
  "w-full shrink-0 border-t border-vc-default px-8 py-6 lg:w-[322px] lg:border-t-0 lg:border-l lg:px-6";

function Frame({ main, rail }: { main: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-stretch lg:flex-row">
      <div className={COLUMN}>{main}</div>
      <aside className={RAIL} aria-label="Task detail">
        {rail}
      </aside>
    </div>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-vc-muted ${className}`} aria-hidden="true" />;
}

function LoadingWork() {
  return (
    <div data-testid="v2-my-work-loading" role="status" aria-busy="true">
      <span className="sr-only">Loading your work</span>
      <Frame
        main={
          <>
            <Bar className="h-7 w-80" />
            <Bar className="mt-3 h-4 w-96" />
            <Bar className="mt-6 h-5 w-72" />
            <Bar className="mt-6 h-12 w-full" />
            <Bar className="mt-3 h-12 w-full" />
            <Bar className="mt-3 h-12 w-full" />
          </>
        }
        rail={
          <>
            <Bar className="h-5 w-48" />
            <Bar className="mt-4 h-4 w-32" />
            <Bar className="mt-2 h-4 w-full" />
            <Bar className="mt-8 h-9 w-full" />
          </>
        }
      />
    </div>
  );
}

/** No brands at all. Named, not blank: the account is new, not broken. */
function NoBrand() {
  return (
    <Frame
      main={
        <div data-testid="v2-my-work-no-brand" className="max-w-lg">
          <h1 className="text-metric font-semibold text-vc-primary">Add a brand to start</h1>
          <p className="mt-2 text-body text-vc-secondary">
            Work is ranked per brand, and there is no brand on this account yet. Add one and the
            first task appears here.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/welcome">Add a brand</Link>
          </Button>
        </div>
      }
      rail={<p className="text-body text-vc-secondary">Tasks appear with your first brand.</p>}
    />
  );
}

/** A brand with no tasks at all. Says so plainly, and names the brand, rather
 *  than rendering an empty table frame. */
function EmptyWork({ brandName }: { brandName: string }) {
  return (
    <Frame
      main={
        <div data-testid="v2-my-work-empty" className="max-w-lg">
          <h1 className="text-metric font-semibold text-vc-primary">No work yet</h1>
          <p className="mt-2 text-body text-vc-secondary">
            Nothing has been queued for {brandName}. Tasks appear once the brand has been read and
            measured for the first time.
          </p>
        </div>
      }
      rail={
        <p className="text-body text-vc-secondary">
          The evidence and the completion rule for a task appear here once there is one.
        </p>
      }
    />
  );
}

export default function MyWorkPage({ taskId }: { taskId?: string }) {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const tasksQuery = useWorkTasks(selectedBrandId);
  const summaryQuery = useWorkSummary(selectedBrandId);
  const detailQuery = useWorkTask(selectedBrandId, taskId);

  const [tab, setTab] = useState<TabId>("todo");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const items = useMemo(() => tasksQuery.data?.items ?? [], [tasksQuery.data]);
  const buckets = useMemo(() => bucketTasks(items), [items]);

  if (brandsLoading) return <LoadingWork />;
  if (!selectedBrandId) return <NoBrand />;

  // The deep-linked task owns the screen. Its own read is what decides the
  // branch, so a task that is not in the first page of the list still opens.
  if (taskId) {
    if (detailQuery.isPending) return <LoadingWork />;
    if (detailQuery.isError) {
      return (
        <Frame
          main={
            <div data-testid="v2-my-work-detail-error">
              <ErrorState
                title="This task could not be loaded"
                description="Nothing has been lost. Try again, or go back to the list."
                onRetry={() => void detailQuery.refetch()}
                isRetrying={detailQuery.isFetching}
              />
              <p className="mt-4 text-center text-caption">
                <Link to="/v2/my-work" search={{}} className="text-vc-accent hover:underline">
                  Back to my work
                </Link>
              </p>
            </div>
          }
          rail={<p className="text-body text-vc-secondary">The task detail is unavailable.</p>}
        />
      );
    }
    return (
      <Frame
        main={<TaskDetail brandId={selectedBrandId} task={detailQuery.data} />}
        rail={<TaskDetailRail task={detailQuery.data} summary={summaryQuery.data} />}
      />
    );
  }

  if (tasksQuery.isPending) return <LoadingWork />;

  if (tasksQuery.isError) {
    return (
      <Frame
        main={
          <div data-testid="v2-my-work-error">
            <ErrorState
              title="Your work could not be loaded"
              description="The task list for this brand did not load. Nothing has been lost - try again."
              onRetry={() => void tasksQuery.refetch()}
              isRetrying={tasksQuery.isFetching}
            />
          </div>
        }
        rail={<p className="text-body text-vc-secondary">Task detail is unavailable right now.</p>}
      />
    );
  }

  if (items.length === 0) return <EmptyWork brandName={selectedBrand?.name ?? "this brand"} />;

  // The rail follows the row the reader picked; before they pick one it
  // follows the first row of the tab they are on, so the rail is never an
  // empty column beside a full table.
  const visible = buckets[tab];
  const previewId =
    selectedId && items.some((task) => task.id === selectedId)
      ? selectedId
      : (visible[0]?.id ??
        TAB_ORDER.map((id) => buckets[id][0]?.id).find((candidate) => Boolean(candidate)));

  return (
    <Frame
      main={
        <WorkTable
          buckets={buckets}
          activeTab={tab}
          onTab={(next) => {
            setTab(next);
            setSelectedId(undefined);
          }}
          selectedId={previewId}
          onSelectTask={setSelectedId}
          summary={summaryQuery.data}
          truncated={Boolean(tasksQuery.data?.nextCursor) || items.length >= TASK_PAGE_LIMIT}
        />
      }
      rail={<TaskPreview brandId={selectedBrandId} taskId={previewId} />}
    />
  );
}
