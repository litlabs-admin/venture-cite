// Live values: mention rate, mentions, failed attempts, citation count, trend,
// engine count, approved questions, last observation, completed work, and awards.
// Pending backend work: recommendations, connected business results, and next action.

import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import {
  approvedQuestionCount,
  awardForTask,
  useApprovedQuestions,
  useAwardEvents,
  useEngineRankings,
  useVerifiedWork,
  useVisibilityHero,
  verificationLabel,
  type VisibilityHero,
  type WorkHistoryEventView,
} from "@/v2/data/visibilityEvidence";
import {
  hasNoObservations,
  latestObservedWeek,
  observationWindowStart,
  useVisibilityMentionRate,
  type VisibilityMentionRate,
} from "@/v2/data/visibilityTrend";
import type { Board08Data, Board08Trend, Board08Value, Board08WorkItem } from "./Screen";

type ApprovedQuestionsResponse = NonNullable<ReturnType<typeof useApprovedQuestions>["data"]>;
type WorkHistoryResponse = NonNullable<ReturnType<typeof useVerifiedWork>["data"]>;
type AwardEventsResponse = NonNullable<ReturnType<typeof useAwardEvents>["data"]>;
type RankingsResponse = NonNullable<ReturnType<typeof useEngineRankings>["data"]>;

export type Board08ApiSnapshot = {
  brandId: string;
  rate: VisibilityMentionRate;
  hero: VisibilityHero;
  rankings: RankingsResponse;
  approvedQuestions: ApprovedQuestionsResponse;
  verifiedWork: WorkHistoryResponse;
  awardEvents: AwardEventsResponse;
};

type Board08AdapterState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-measured"; reason: string };

function measured<T>(value: T): Board08Value<T> {
  return { kind: "measured", value };
}

function notMeasured<T>(reason: string): Board08Value<T> {
  return { kind: "not-measured", reason };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function toTrend(rate: VisibilityMentionRate): Board08Value<Board08Trend> {
  if (hasNoObservations(rate.weeks)) {
    return notMeasured("Create a baseline before measuring visibility.");
  }

  const first = rate.weeks[0]?.weekStart;
  const middle = rate.weeks[Math.floor(rate.weeks.length / 2)]?.weekStart;
  const last = rate.weeks[rate.weeks.length - 1]?.weekStart;
  if (!first || !middle || !last) {
    return notMeasured("Create a baseline before measuring visibility.");
  }

  return measured({
    points: rate.weeks.map((week) => (week.measured > 0 ? week.mentionRate : null)),
    xLabels: [formatDate(first), formatDate(middle), formatDate(last)],
  });
}

function toWorkIcon(taskType: WorkHistoryEventView["taskType"]): Board08WorkItem["icon"] {
  switch (taskType) {
    case "improve_page_for_buyer_need":
      return "map";
    case "approve_essential_brand_facts":
    case "approve_buyer_question_set":
    case "establish_measurement_baseline":
    case "repair_confirmed_access_or_factual_fault":
    case "complete_earned_media_or_community_work":
    case "review_results_and_record_decision":
    case "complete_visibility_experiment":
      return "doc";
    default: {
      const exhaustive: never = taskType;
      return exhaustive;
    }
  }
}

function mapCompletedWork(
  events: readonly WorkHistoryEventView[],
  awardEvents: readonly WorkHistoryEventView[],
): Board08WorkItem[] {
  return events.map((event) => {
    const award = awardForTask([...awardEvents], event.taskId);
    const state = verificationLabel(event.verificationMethod);
    return {
      title: event.taskTitle,
      icon: toWorkIcon(event.taskType),
      state: state ? measured(state) : notMeasured("The verification method is not recorded."),
      points: award
        ? measured(award.points)
        : notMeasured("No current award record exists for this work item."),
    };
  });
}

function lastObservation(rate: VisibilityMentionRate, hero: VisibilityHero): Board08Value<string> {
  const observed = hero.lastScanAt ?? latestObservedWeek(rate.weeks)?.weekStart;
  return observed
    ? measured(formatDate(observed))
    : notMeasured("No observation has been recorded.");
}

export function mapBoard08Data(snapshot: Board08ApiSnapshot): Board08Data {
  const hasMeasuredAnswers = snapshot.rate.measured > 0;
  const approved = approvedQuestionCount(snapshot.approvedQuestions.items);
  const engines = snapshot.rankings.platforms.length;

  return {
    navigation: { brandId: snapshot.brandId, mode: "expert" },
    visibility: {
      mentionRate: hasMeasuredAnswers
        ? measured(snapshot.rate.mentionRate / 100)
        : notMeasured("No successful answer sample exists."),
      mentioned: hasMeasuredAnswers
        ? measured(snapshot.rate.cited)
        : notMeasured("No successful answer sample exists."),
      successfulAnswers: hasMeasuredAnswers
        ? measured(snapshot.rate.measured)
        : notMeasured("No successful answer sample exists."),
      failedAttempts: measured(snapshot.rate.failed),
      recommendations: notMeasured("Recommendation outcomes are not stored."),
      citations:
        hasMeasuredAnswers && snapshot.hero.totalChecks > 0
          ? measured(snapshot.hero.citedChecks)
          : notMeasured("Citation outcomes are not measured for this sample."),
      engineCount:
        engines > 0 ? measured(engines) : notMeasured("No engine coverage is available."),
      approvedQuestionCount:
        approved !== null ? measured(approved) : notMeasured("No approved question set exists."),
      lastObservedAt: lastObservation(snapshot.rate, snapshot.hero),
      trend: toTrend(snapshot.rate),
    },
    completedWork: mapCompletedWork(snapshot.verifiedWork.items, snapshot.awardEvents.items),
    businessResults: {
      kind: "not-measured",
      label: "Analytics not connected",
      detail: "Connect a source to measure referral visits and qualified leads.",
    },
    nextAction: notMeasured("No live next-action source exists yet."),
  };
}

export function board08QueryResult(state: Board08AdapterState): V2LiveResult<Board08Data> {
  switch (state.kind) {
    case "loading":
      return { state };
    case "error":
      return { state };
    case "not-measured":
      return { state };
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Visibility data could not be loaded.";
}

export function useBoard08Data(): V2LiveResult<Board08Data> {
  const { selectedBrandId, isLoading: isBrandLoading } = useBrandSelection();
  const brandId = selectedBrandId;
  const rateQuery = useVisibilityMentionRate(brandId);
  const observationStart = observationWindowStart(rateQuery.data);
  const heroQuery = useVisibilityHero(brandId, observationStart);
  const rankingsQuery = useEngineRankings(brandId, observationStart);
  const approvedQuestionsQuery = useApprovedQuestions(brandId);
  const verifiedWorkQuery = useVerifiedWork(brandId);
  const awardEventsQuery = useAwardEvents(brandId);

  if (isBrandLoading || !brandId) {
    return board08QueryResult(
      isBrandLoading
        ? { kind: "loading" }
        : { kind: "not-measured", reason: "No brand is selected." },
    );
  }

  const queries = [
    rateQuery,
    heroQuery,
    rankingsQuery,
    approvedQuestionsQuery,
    verifiedWorkQuery,
    awardEventsQuery,
  ] as const;
  const failedQuery = queries.find((query) => query.isError);
  if (failedQuery) {
    return board08QueryResult({ kind: "error", message: errorMessage(failedQuery.error) });
  }

  if (
    queries.some((query) => query.isPending) ||
    !rateQuery.data ||
    !heroQuery.data ||
    !rankingsQuery.data ||
    !approvedQuestionsQuery.data ||
    !verifiedWorkQuery.data ||
    !awardEventsQuery.data
  ) {
    return board08QueryResult({ kind: "loading" });
  }

  const snapshot: Board08ApiSnapshot = {
    brandId,
    rate: rateQuery.data,
    hero: heroQuery.data,
    rankings: rankingsQuery.data,
    approvedQuestions: approvedQuestionsQuery.data,
    verifiedWork: verifiedWorkQuery.data,
    awardEvents: awardEventsQuery.data,
  };
  const data = mapBoard08Data(snapshot);
  const updatedAt = Math.min(
    ...queries.map((query) => query.dataUpdatedAt).filter((value) => value > 0),
  );
  if (Number.isFinite(updatedAt) && Date.now() - updatedAt > 24 * 60 * 60 * 1000) {
    return {
      state: {
        kind: "stale",
        reason: "Visibility data may be out of date.",
        asOf: new Date(updatedAt).toISOString(),
      },
      data,
    };
  }

  return { state: { kind: "ready" }, data };
}
