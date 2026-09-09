import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { EvidenceReference, TaskState } from "@shared/work";
import type { WorkTaskSummaryView } from "./workSummary";

// My work's reads and writes.
//
// QUERY KEYS ARE NAMESPACED `["v2", ...]`, for the reason `workSummary.ts`
// gives: the query client is a singleton shared with the live dashboard, so a
// key shaped like the live app's would let an invalidation from this tree
// re-render the live dashboard.

/** Evidence as the detail endpoint projects it (`server/routes/work.ts`
 *  `projectTask`, dates already ISO). `structuredFinding` is the original
 *  `EvidenceReference` the row was written from - it is what a verify call
 *  has to send back, and it is why this screen never has to invent one. */
export type WorkEvidenceView = {
  id: string;
  taskId: string;
  brandId: string;
  taskVersion: number;
  evidenceVersion: number;
  role: "trigger" | "submission" | "verification" | "result";
  kind: string;
  status: "submitted" | "verified" | "rejected" | "unavailable" | "failed";
  sourceUrl: string | null;
  finalUrl: string | null;
  canonicalUrl: string | null;
  retrievedAt: string | null;
  observedAt: string | null;
  excerpt: string | null;
  structuredFinding: unknown;
  createdAt: string;
};

export type WorkHistoryEventView = {
  id: string;
  taskId: string;
  revision: number;
  priorState: TaskState | null;
  state: TaskState;
  actorKind: string;
  reason: string | null;
  occurredAt: string | null;
};

/** The completion rule the task was created with. `required` is the set of
 *  evidence kinds `server/domains/work/policy.ts` will insist on before the
 *  task can be verified - the screen reads it rather than restating a rule of
 *  its own. */
export type CompletionRuleView = { required?: string[] } | null;

export type WorkTaskDetailView = WorkTaskSummaryView & {
  completionRule?: CompletionRuleView;
  evidence?: WorkEvidenceView[];
  history?: WorkHistoryEventView[];
};

export type WorkTaskPage = { items: WorkTaskSummaryView[]; nextCursor: string | null };

/** The list endpoint's ceiling (`listQuerySchema`, `server/routes/work.ts`). */
export const TASK_PAGE_LIMIT = 100;

async function readJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await apiRequest("POST", url, body);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

/**
 * Every task for the brand, in one page.
 *
 * The four tabs are cut from this one read rather than from four filtered
 * ones: the tabs partition a set the user thinks of as whole, and four
 * independent pages would let the counts disagree with each other while they
 * settled. `nextCursor` is surfaced to the screen so a brand with more than
 * `TASK_PAGE_LIMIT` tasks says so instead of quietly showing a prefix.
 */
export function useWorkTasks(brandId: string) {
  return useQuery<WorkTaskPage>({
    queryKey: ["v2", "work", "tasks", brandId, "all"],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readJson<WorkTaskPage>(
        `/api/brands/${encodeURIComponent(brandId)}/work/tasks?limit=${TASK_PAGE_LIMIT}`,
      ),
  });
}

/** One task, with its evidence and its state history. */
export function useWorkTask(brandId: string, taskId: string | undefined) {
  return useQuery<WorkTaskDetailView>({
    queryKey: ["v2", "work", "task", brandId, taskId ?? ""],
    enabled: Boolean(brandId) && Boolean(taskId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readJson<WorkTaskDetailView>(
        `/api/brands/${encodeURIComponent(brandId)}/work/tasks/${encodeURIComponent(taskId ?? "")}`,
      ),
  });
}

export type TaskCommand =
  | { kind: "accept" }
  | { kind: "start" }
  | { kind: "dismiss"; reason: string }
  | { kind: "mark_not_applicable"; reason: string }
  | { kind: "reopen"; reason: string };

/**
 * A state transition.
 *
 * `expectedRevision` is sent, never omitted: the server rejects a stale
 * revision with a conflict rather than applying the command to a task that
 * has moved on, and dropping it would turn that protection off.
 */
export function useTaskCommand(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    WorkTaskSummaryView,
    Error,
    { taskId: string; expectedRevision: number; command: TaskCommand }
  >({
    mutationFn: ({ taskId, expectedRevision, command }) =>
      postJson<WorkTaskSummaryView>(
        `/api/brands/${encodeURIComponent(brandId)}/work/tasks/${encodeURIComponent(taskId)}/commands`,
        { expectedRevision, command },
      ),
    onSuccess: () => {
      // Scoped to this tree's namespace. `["v2"]` cannot match a live
      // dashboard key, so this refetches My work and Today and nothing else.
      void queryClient.invalidateQueries({ queryKey: ["v2", "work"] });
    },
  });
}

export type VerifyInput = {
  taskId: string;
  expectedRevision: number;
  cycleKey: string;
  note: string;
  confirmedByUserId: string;
  evidence: EvidenceReference[];
};

/**
 * The human confirmation that completes a submitted task.
 *
 * `cycleKey` is the caller's idempotency key: `verifyAndAward` derives the
 * award key from it, and a repeat with the same key returns the award that
 * already exists rather than paying twice. The caller therefore passes a key
 * derived from the task version, not a fresh one per click.
 */
export function useVerifyTask(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, VerifyInput>({
    mutationFn: ({ taskId, expectedRevision, cycleKey, note, confirmedByUserId, evidence }) =>
      postJson<unknown>(
        `/api/brands/${encodeURIComponent(brandId)}/work/tasks/${encodeURIComponent(taskId)}/verify`,
        {
          expectedRevision,
          cycleKey,
          verification: { kind: "human_confirmation", confirmedByUserId, note },
          evidence,
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v2", "work"] });
    },
  });
}
