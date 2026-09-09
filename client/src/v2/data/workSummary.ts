import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { TaskState, TaskType } from "@shared/work";

// The Today screen's two work reads.
//
// QUERY KEYS ARE NAMESPACED `["v2", ...]` ON PURPOSE. The query client is a
// singleton mounted at the app root and shared with the live dashboard. A key
// shaped like the live app's (`["/api/brands/..."]`) would share cache entries
// with it, so an invalidation from this tree would re-render the live
// dashboard - and the default queryFn would also try to build a URL out of the
// key. Both are avoided by namespacing and by passing an explicit `queryFn`.

export type WorkTaskSummaryView = {
  id: string;
  brandId: string;
  goalId: string | null;
  taskKey: string;
  taskVersion: number;
  type: TaskType;
  state: TaskState;
  revision: number;
  title: string;
  desiredResult: string;
  buyerNeed: string | null;
  recommendedChange: string;
  reason: string | null;
  confidence: number | null;
  /** Minutes. Nullable in the schema, so the screen must survive its absence. */
  effort: number | null;
  points: number;
  nextCheckAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkLevelView = { level: number; name: string; points: number };

export type WorkSummaryView = {
  brandId: string;
  points: number;
  pendingCount: number;
  milestones: string[];
  currentLevel: WorkLevelView;
  nextThreshold: WorkLevelView | null;
  goal: { title: string; statement: string } | null;
  nextTask: WorkTaskSummaryView | null;
  waitingTasks: WorkTaskSummaryView[];
  mode: "guided" | "expert";
};

async function readJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

export function useWorkSummary(brandId: string) {
  return useQuery<WorkSummaryView>({
    queryKey: ["v2", "work", "summary", brandId],
    enabled: Boolean(brandId),
    // The screen renders its own error block, so the global query toast would
    // report the same failure twice.
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readJson<WorkSummaryView>(`/api/brands/${encodeURIComponent(brandId)}/work/summary`),
  });
}

/**
 * The ranked queue behind the lead task.
 *
 * `status=assigned` is the server's name for the six actionable states
 * (`WorkService.stateFilter`), and `getTaskPage` sorts with the same
 * comparator `getToday` uses. So the first three rows of this list are the
 * same three tasks, in the same order, that produced `summary.nextTask` -
 * which is why the rows under the lead task can be taken from here without
 * inventing a second ranking.
 */
export function useAssignedTasks(brandId: string) {
  return useQuery<{ items: WorkTaskSummaryView[]; nextCursor: string | null }>({
    queryKey: ["v2", "work", "tasks", brandId, "assigned"],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readJson<{ items: WorkTaskSummaryView[]; nextCursor: string | null }>(
        `/api/brands/${encodeURIComponent(brandId)}/work/tasks?status=assigned&limit=3`,
      ),
  });
}
