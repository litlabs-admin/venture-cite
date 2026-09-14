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
//   - No business-results READ anywhere in the API. There is now a write
//     (`useRecordBusinessResults`, `POST /api/brands/:brandId/business-
//     results`), which is what the outcome-review screen's manual-entry form
//     saves to - `business_result_events` (migration 0131) had no writer
//     before it. There is still no read, so a screen cannot show a business
//     result back once saved; it can only confirm the write succeeded.
//
// THE APPROVED-QUESTION COUNT IS NOT ON A VISIBILITY READ, and for a while
// that was taken to mean it did not exist. It does. Approval in this product
// is a reviewer confirming the `approve_buyer_question_set` task, and the
// verified task carries the very question ids it approved in
// `completionRule.questionIds` (`server/services/work/sources/
// questionOpportunities.ts`). `useApprovedQuestions` reads it from the work
// queue. A tracked question is NOT an approved one - `promptGenerator.ts`
// writes `status: "tracked"` on its own - so nothing here counts prompt rows.
//
// THE WINDOW IS PASSED, NEVER DEFAULTED. The three dashboard reads below take
// an optional `since`; without one, `loadRankingsContext` applies a 30-DAY
// window, which is not the eight-week window the mention rate and the trend
// use. Reading them undefaulted put two different samples in one panel - 94
// successful answers beside engine totals summing to 36, and an "attributed
// sources ... in this window" line naming a window nothing else on the screen
// drew. Each hook now requires the window start (`observationWindowStart`) and
// stays disabled until it is known, so no read can fetch the wrong sample
// first and show it.

async function readData<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

/** `?since=` for a read that takes one. Encoded here so the three hooks below
 *  cannot spell the parameter differently. */
function sinceQuery(since: string): string {
  return `?since=${encodeURIComponent(since)}`;
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

export function useVisibilityHero(brandId: string, since: string | undefined) {
  return useQuery<VisibilityHero>({
    queryKey: ["v2", "visibility", "hero", brandId, since ?? ""],
    enabled: Boolean(brandId) && Boolean(since),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<VisibilityHero>(
        `/api/dashboard/hero/${encodeURIComponent(brandId)}${sinceQuery(since!)}`,
      ),
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

export function useCitedUrls(brandId: string, since: string | undefined) {
  return useQuery<CitedUrlPage>({
    queryKey: ["v2", "visibility", "cited-urls", brandId, since ?? ""],
    enabled: Boolean(brandId) && Boolean(since),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<CitedUrlPage>(
        `/api/dashboard/cited-urls/${encodeURIComponent(brandId)}${sinceQuery(since!)}`,
      ),
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

export function useEngineRankings(brandId: string, since: string | undefined) {
  return useQuery<{ platforms: EngineRanking[] }>({
    queryKey: ["v2", "visibility", "engines", brandId, since ?? ""],
    enabled: Boolean(brandId) && Boolean(since),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<{ platforms: EngineRanking[] }>(
        `/api/dashboard/rankings/${encodeURIComponent(brandId)}${sinceQuery(since!)}`,
      ),
  });
}

/** The question-set approval task, in the only fields this count reads. */
type QuestionApprovalTask = {
  state: TaskState;
  updatedAt: string;
  completionRule?: { questionIds?: string[] } | null;
};

/** The states in which a reviewer has confirmed the set. `verified` is the
 *  state confirmation lands in; `waiting_for_observation` is where it moves
 *  once awarded. Every other state - `suggested` included - is a set nobody
 *  has approved, which is not an approved count of zero. */
const APPROVED_STATES: readonly TaskState[] = ["verified", "waiting_for_observation"];

/**
 * How many buyer questions the reviewer has approved, or `null` for never.
 *
 * `null` is the honest answer while the set is still awaiting review, and it
 * is what the rail renders as "Not measured". A number appears only once a
 * confirmation exists, and it is the size of the set that confirmation named -
 * not the count of tracked prompts, which nobody approved.
 */
export function approvedQuestionCount(tasks: QuestionApprovalTask[] | undefined): number | null {
  if (!tasks) return null;
  const approved = tasks
    .filter((task) => APPROVED_STATES.includes(task.state))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const ids = approved?.completionRule?.questionIds;
  return Array.isArray(ids) ? ids.length : null;
}

export function useApprovedQuestions(brandId: string) {
  return useQuery<{ items: QuestionApprovalTask[]; nextCursor: string | null }>({
    queryKey: ["v2", "work", "tasks", brandId, "question-approval"],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<{ items: QuestionApprovalTask[]; nextCursor: string | null }>(
        `/api/brands/${encodeURIComponent(brandId)}/work/tasks?taskType=approve_buyer_question_set&limit=25`,
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

/**
 * The award stream.
 *
 * WHY THIS IS A SECOND READ AND NOT A FIELD ON THE FIRST. `WorkService.
 * getHistory` emits an award event only when the request carries NO status
 * filter (`if (filters.status && filters.status !== "reversed") continue`), and
 * the state transitions it emits under `status=verified` carry no `award`. So
 * the verified-change list can never report a point award, however many
 * `work_award_events` rows a brand holds - which is how a screen came to read
 * "No points have been awarded yet" beside a rail saying 20 work points.
 *
 * The unfiltered stream is read here for the awards alone. The completed-work
 * list keeps its `status=verified` read, because that filter is what makes it
 * a list of finished changes rather than of every transition.
 */
export function useAwardEvents(brandId: string) {
  return useQuery<{ items: WorkHistoryEventView[]; nextCursor: string | null }>({
    queryKey: ["v2", "work", "history", brandId, "awards"],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<{ items: WorkHistoryEventView[]; nextCursor: string | null }>(
        `/api/brands/${encodeURIComponent(brandId)}/work/history?limit=50`,
      ),
  });
}

/** The points granted for one task, or `null` when none was. A task can be
 *  verified without an award - the award is a separate record - so the absence
 *  is left unsaid rather than printed as zero points. */
export function awardForTask(
  events: WorkHistoryEventView[] | undefined,
  taskId: string,
): WorkHistoryAwardView | null {
  const match = (events ?? []).find(
    (event) =>
      event.taskId === taskId &&
      event.award &&
      event.award.awarded &&
      event.award.awardStatus === "awarded",
  );
  return match?.award ?? null;
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

/** The four kinds `business_result_events` accepts (migration 0131's check
 *  constraint). There is no fifth for "demo request" - the outcome-review
 *  form maps that count onto `inquiry`, and a qualified-inquiry count onto
 *  `qualified_lead`, rather than inventing a kind the table would reject. */
export type BusinessResultEventKind =
  "referral_visit" | "inquiry" | "qualified_lead" | "retained_customer";

export type BusinessResultEventInput = {
  eventKind: BusinessResultEventKind;
  value: number | null;
  valueUnit: string | null;
  occurredAt: string;
  notes: string | null;
};

/**
 * Record manually entered business results.
 *
 * `POST /api/brands/:brandId/business-results`. Every event this writes is
 * `confirmation_state: "confirmed"` and `attribution_method: "manual"` -
 * a person typed the number in, so nothing here is inferred.
 */
export function useRecordBusinessResults(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (events: BusinessResultEventInput[]) => {
      const response = await apiRequest(
        "POST",
        `/api/brands/${encodeURIComponent(brandId)}/business-results`,
        { events },
      );
      return (await response.json()) as { success: boolean };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v2"] });
    },
  });
}
