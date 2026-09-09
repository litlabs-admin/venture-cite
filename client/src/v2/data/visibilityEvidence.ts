import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { TaskState, TaskType, VerificationMethod } from "@shared/work";
import type { WorkTaskSummaryView } from "./workSummary";

// The Visibility area's reads.
//
// Every key is namespaced `["v2", ...]`. The query client is a singleton
// shared with the live dashboard, which reads three of these same endpoints
// under its own keys; namespacing keeps the two caches apart so an
// invalidation here cannot re-render the live dashboard, and so the default
// URL-from-key queryFn is never used.
//
// WHAT THESE ENDPOINTS DO NOT RETURN is as load-bearing as what they do.
// Recorded here once, so no screen in this area has to rediscover it:
//   - No confidence interval. The mention-rate read returns weekly point
//     buckets and `shared/visibilityMetrics.ts` computes no interval, so the
//     band the artboards draw around the trend has no source and is not drawn.
//   - No recommendation count. `geo_rankings` stores `isCited`, `rank`,
//     `sentiment` and authority - nothing that records an engine
//     recommending the brand - so "Recommendations" is Not measured.
//   - Failed attempts ARE countable, and not from these reads: a provider
//     call that returned nothing still writes a `geo_rankings` row carrying a
//     "Check failed:" status line, which is what
//     `GET /api/v2/visibility/mention-rate/:brandId` counts and excludes from
//     its denominator. None of the endpoints below report it.
//   - No approved-question count on any endpoint in this area.
//   - No business-results source anywhere in the API.

async function readData<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

/** `GET /api/dashboard/hero/:brandId`. */
export type VisibilityHero = {
  visibilityScore: number;
  visibilityDelta: number;
  /** Answers in which the brand was cited. */
  citedChecks: number;
  /** Successful answers collected. ZERO MEANS NEVER MEASURED, not measured-zero. */
  totalChecks: number;
  /** `citationRatePct`, which returns 0 when `totalChecks` is 0. */
  citationRate: number;
  lastScanAt: string | null;
};

export function useVisibilityHero(brandId: string) {
  return useQuery<VisibilityHero>({
    queryKey: ["v2", "visibility", "hero", brandId],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () => readData<VisibilityHero>(`/api/dashboard/hero/${encodeURIComponent(brandId)}`),
  });
}

/** `GET /api/dashboard/cited-urls/:brandId`. One row per (engine, question,
 *  source url): the source an engine actually attributed the brand to. */
export type CitedUrlRow = {
  platform: string;
  prompt: string;
  url: string;
  citedAt: string;
};

export type CitedUrlPage = { items: CitedUrlRow[]; total: number; truncated: boolean };

export function useCitedUrls(brandId: string) {
  return useQuery<CitedUrlPage>({
    queryKey: ["v2", "visibility", "cited-urls", brandId],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<CitedUrlPage>(`/api/dashboard/cited-urls/${encodeURIComponent(brandId)}`),
  });
}

/** `GET /api/dashboard/rankings/:brandId`. The engines that returned answers.
 *  Engine names come from the payload; none is written into this tree. */
export type EngineRanking = {
  aiPlatform: string;
  isLive: boolean;
  rank: number;
  citedCount: number;
  totalCount: number;
  visibilityScore: number;
  strengthLabel: "Weak" | "Moderate" | "Strong";
  latestSnippet: string | null;
  latestSnippetPrompt: string | null;
  isCitedSnippet: boolean;
};

export function useEngineRankings(brandId: string) {
  return useQuery<{ platforms: EngineRanking[] }>({
    queryKey: ["v2", "visibility", "engines", brandId],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<{ platforms: EngineRanking[] }>(
        `/api/dashboard/rankings/${encodeURIComponent(brandId)}`,
      ),
  });
}

/** `GET /api/brands/:brandId/work/history`. */
export type WorkHistoryAwardView = {
  awardKey: string;
  points: number;
  taskType: TaskType;
  taskVersion: number;
  ruleVersion: number;
  cycleKey: string;
  verification: VerificationMethod;
  evidenceCount: number;
  awarded: boolean;
  awardedAt: string;
  awardStatus: "awarded" | "reversed" | "adjustment";
};

export type WorkHistoryEventView = {
  id: string;
  taskId: string;
  brandId: string;
  taskVersion: number;
  taskTitle: string;
  taskType: TaskType;
  revision: number;
  priorState: string | null;
  state: TaskState;
  actorId: string | null;
  actorKind: string;
  reason: string | null;
  verificationMethod: VerificationMethod | null;
  occurredAt: string;
  award?: WorkHistoryAwardView;
};

/**
 * Completed work.
 *
 * `status=verified` is the server's filter for the state transition that ends
 * a change (`listQuerySchema`, `WorkService.getHistory`), so these rows are
 * exactly the changes a user can claim as done - not everything that ever
 * moved.
 */
export function useVerifiedWork(brandId: string) {
  return useQuery<{ items: WorkHistoryEventView[]; nextCursor: string | null }>({
    queryKey: ["v2", "work", "history", brandId, "verified"],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<{ items: WorkHistoryEventView[]; nextCursor: string | null }>(
        `/api/brands/${encodeURIComponent(brandId)}/work/history?status=verified&limit=25`,
      ),
  });
}

/** How a change was proven, in the user's words. `null` when the event
 *  carries no method - which is not the same as a change proving itself. */
export function verificationLabel(method: VerificationMethod | null | undefined): string | null {
  if (!method) return null;
  return method.kind === "human_confirmation" ? "Confirmed by owner" : "Verified";
}

/** Awards actually granted. A reversed or adjusted award is excluded from a
 *  total so the sum on screen matches the points the brand holds. */
export function grantedAwards(events: WorkHistoryEventView[] | undefined): WorkHistoryAwardView[] {
  if (!events) return [];
  return events.flatMap((event) =>
    event.award && event.award.awarded && event.award.awardStatus === "awarded"
      ? [event.award]
      : [],
  );
}

/**
 * The review task, if the queue holds one.
 *
 * The results review posts against a task, so the screen needs the task's id
 * and revision before it can offer to save anything. `status=assigned` is the
 * server's name for the actionable states; `taskType` narrows it to the one
 * task type a results review belongs to.
 */
export function useReviewTask(brandId: string) {
  return useQuery<{ items: WorkTaskSummaryView[]; nextCursor: string | null }>({
    queryKey: ["v2", "work", "tasks", brandId, "review"],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<{ items: WorkTaskSummaryView[]; nextCursor: string | null }>(
        `/api/brands/${encodeURIComponent(brandId)}/work/tasks?status=assigned&taskType=review_results_and_record_decision&limit=1`,
      ),
  });
}

/** The four outcomes the server accepts (`reviewRequestSchema`). The wording
 *  is the artboard's; the value is the contract's. Nothing is mapped loosely:
 *  each label states the observation the value records. */
export const REVIEW_DECISIONS = [
  { value: "improvement", label: "Visibility improved — continue the change" },
  { value: "no_material_change", label: "No material change — the evidence is not yet conclusive" },
  { value: "decline", label: "Visibility declined — revise the approach" },
  { value: "unavailable", label: "The measurement is unavailable for this period" },
] as const;

export type ReviewDecision = (typeof REVIEW_DECISIONS)[number]["value"];

/**
 * Record a results review.
 *
 * `cycleKey` is the review PERIOD, not a measurement: the server uses it as
 * the idempotency key behind "once per review period", and the period this
 * screen reviews is the observation window it draws. Passing the latest
 * observed week start names that window exactly, and the same string is the
 * measurement scope, so the record says which period it judged.
 */
export function useRecordResultsReview(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      taskId: string;
      expectedRevision: number;
      cycleKey: string;
      decision: ReviewDecision;
      notes: string | null;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/brands/${encodeURIComponent(brandId)}/work/tasks/${encodeURIComponent(input.taskId)}/review`,
        {
          expectedRevision: input.expectedRevision,
          cycleKey: input.cycleKey,
          measurementScope: { kind: "period", period: input.cycleKey },
          decision: input.decision,
          notes: input.notes,
        },
      );
      return (await response.json()) as { success: boolean };
    },
    onSuccess: () => {
      // Only this tree's keys. The live dashboard shares the query client and
      // must not be re-rendered by a write made here.
      void queryClient.invalidateQueries({ queryKey: ["v2"] });
    },
  });
}
