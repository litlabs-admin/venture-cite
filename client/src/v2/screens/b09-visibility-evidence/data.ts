// Live: mention rate and trend, successful and failed attempts, engines, approved questions,
// verified work, awards, source rows, last checked time, and review points. Pending: confidence
// bands, recommendation results, and business-results connection state.

import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import {
  awardForTask,
  useApprovedQuestions,
  useAwardEvents,
  useCitedUrls,
  useEngineRankings,
  useReviewTask,
  useVerifiedWork,
  useVisibilityHero,
} from "@/v2/data/visibilityEvidence";
import { observationWindowStart, useVisibilityMentionRate } from "@/v2/data/visibilityTrend";
import { useWorkSummary } from "@/v2/data/workSummary";
import type { Board09Data, Board09QuerySnapshot, Board09Value } from "./Screen";

function measured<T>(value: T): Board09Value<T> {
  return { kind: "measured", value };
}

function failed<T>(reason: string): Board09Value<T> {
  return { kind: "failed", reason };
}

function notMeasured<T>(reason: string): Board09Value<T> {
  return { kind: "not-measured", reason };
}

function queryValue<T>(
  data: unknown,
  isError: boolean,
  value: T | undefined,
  failureReason: string,
  missingReason: string,
): Board09Value<T> {
  if (isError) return failed(failureReason);
  if (data === undefined || value === undefined) return notMeasured(missingReason);
  return measured(value);
}

function formatDate(value: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ] as const;
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]}, ${hour}:${minute}`;
}

function sourcePath(value: string): string {
  try {
    const url = new URL(value);
    return url.pathname || "/";
  } catch {
    return value;
  }
}

function formatTrendLabel(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function approvedQuestionCount(
  items: readonly {
    state: string;
    updatedAt: string;
    completionRule?: { questionIds?: readonly string[] } | null;
  }[],
): number | undefined {
  const approved = items
    .filter((item) => item.state === "verified" || item.state === "waiting_for_observation")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const questionIds = approved?.completionRule?.questionIds;
  return questionIds ? questionIds.length : undefined;
}

function changeSummary(count: number): string {
  if (count === 1) return "One distinct change verified";
  if (count === 2) return "Two distinct changes verified";
  return `${count} distinct changes verified`;
}

function isLoading(snapshot: Board09QuerySnapshot): boolean {
  return (
    Boolean(snapshot.loading) ||
    [
      snapshot.rate,
      snapshot.hero,
      snapshot.cited,
      snapshot.engines,
      snapshot.approvedQuestions,
      snapshot.work,
      snapshot.awards,
      snapshot.summary,
      snapshot.review,
    ].some((query) => query.isPending)
  );
}

function asSourceEvidence(snapshot: Board09QuerySnapshot): Board09Data["sourceEvidence"] {
  if (snapshot.cited.isError) return failed("Source evidence could not be loaded.");
  if (!snapshot.cited.data) return notMeasured("Source evidence has not been measured.");
  return measured(
    snapshot.cited.data.items.slice(0, 3).map((row, index) => ({
      sourcePath: sourcePath(row.url),
      checkType: row.platform,
      checkedAt: formatCheckedAt(row.citedAt),
      result: measured("Citation recorded"),
      selected: index === 0,
    })),
  );
}

function asObservedEngines(snapshot: Board09QuerySnapshot): Board09Data["observedEngines"] {
  if (snapshot.engines.isError) return failed("Engine coverage could not be loaded.");
  if (!snapshot.engines.data) return notMeasured("Engine coverage has not been measured.");
  return measured(
    snapshot.engines.data.platforms.map((platform) => ({
      name: platform.aiPlatform,
      answerCount: measured(platform.totalCount),
    })),
  );
}

function asTrend(snapshot: Board09QuerySnapshot): Board09Data["visibility"]["trend"] {
  const rate = snapshot.rate.data;
  if (!rate) {
    return {
      labels: notMeasured("The trend has not been measured."),
      mentionRate: notMeasured("The trend has not been measured."),
      confidenceUpper: notMeasured("No confidence band is measured."),
      confidenceLower: notMeasured("No confidence band is measured."),
    };
  }
  return {
    labels: measured(rate.weeks.map((week) => formatTrendLabel(week.weekStart))),
    mentionRate: measured(rate.weeks.map((week) => week.mentionRate)),
    confidenceUpper: notMeasured("No confidence interval exists in the visibility response."),
    confidenceLower: notMeasured("No confidence interval exists in the visibility response."),
  };
}

export function mapBoard09Queries(snapshot: Board09QuerySnapshot): Board09Data {
  const rate = snapshot.rate.data;
  const engines = snapshot.engines.data?.platforms.length;
  const approvedQuestions = snapshot.approvedQuestions.data
    ? approvedQuestionCount(snapshot.approvedQuestions.data.items)
    : undefined;
  const points = snapshot.summary.data?.points;
  const nextLevel = snapshot.summary.data?.nextThreshold;
  const awards = snapshot.awards.data?.items;
  const verifiedChanges = snapshot.work.data?.items;
  const sourceEvidence = asSourceEvidence(snapshot);
  const observedEngines = asObservedEngines(snapshot);
  const successfulAnswers = rate?.measured;
  const failedAttempts = rate && rate.observed > 0 ? rate.failed : undefined;
  const lastChecked = formatDate(snapshot.hero.data?.lastScanAt ?? null);

  return {
    context: { brandId: snapshot.brandId, mode: "expert" },
    visibility: {
      mentionRate: rate
        ? measured(rate.mentionRate)
        : notMeasured("The visibility rate has not been measured."),
      mentioned: rate
        ? measured(rate.cited)
        : notMeasured("Brand mentions have not been measured."),
      successfulAnswers: rate
        ? measured(rate.measured)
        : notMeasured("Successful answers have not been measured."),
      failedAttempts:
        rate && rate.observed > 0
          ? measured(rate.failed)
          : notMeasured("No answer attempt has been recorded."),
      approvedQuestions:
        approvedQuestions === undefined
          ? notMeasured("No approved question set exists.")
          : measured(approvedQuestions),
      engines:
        engines === undefined
          ? notMeasured("No engine coverage has been measured.")
          : measured(engines),
      recommendations: notMeasured("No recommendation result is recorded."),
      trend: asTrend(snapshot),
    },
    filters: {
      dateWindow: notMeasured("The live mention-rate endpoint uses eight weekly buckets."),
      engineCount:
        engines === undefined
          ? notMeasured("No engine coverage has been measured.")
          : measured(engines),
      questionCount:
        approvedQuestions === undefined
          ? notMeasured("No approved question set exists.")
          : measured(approvedQuestions),
    },
    verifiedWork: {
      totalPoints: queryValue(
        snapshot.summary.data,
        snapshot.summary.isError,
        points,
        "Verified work could not be loaded.",
        "Verified work points have not been measured.",
      ),
      changeCount: queryValue(
        snapshot.work.data,
        snapshot.work.isError,
        verifiedChanges?.length,
        "Verified work could not be loaded.",
        "Verified changes have not been measured.",
      ),
      changeSummary: queryValue(
        snapshot.work.data,
        snapshot.work.isError,
        verifiedChanges ? changeSummary(verifiedChanges.length) : undefined,
        "Verified work could not be loaded.",
        "Verified changes have not been measured.",
      ),
      level: snapshot.summary.isError
        ? failed("Work level could not be loaded.")
        : snapshot.summary.data
          ? measured(snapshot.summary.data.currentLevel)
          : notMeasured("Work level has not been measured."),
      nextLevel: snapshot.summary.isError
        ? failed("Next work level could not be loaded.")
        : nextLevel
          ? measured({ name: nextLevel.name, points: nextLevel.points })
          : notMeasured("No next work level is available."),
      progressRate: snapshot.summary.isError
        ? failed("Work progress could not be loaded.")
        : points !== undefined && nextLevel
          ? measured(Math.min(1, Math.max(0, points / nextLevel.points)))
          : notMeasured("Work progress has not been measured."),
      changes: snapshot.work.isError
        ? failed("Verified work could not be loaded.")
        : verifiedChanges
          ? measured(
              verifiedChanges.map((change) => ({
                title: change.taskTitle,
                points: awardForTask(awards, change.taskId)
                  ? measured(awardForTask(awards, change.taskId)?.points ?? 0)
                  : notMeasured("This change has no recorded award."),
              })),
            )
          : notMeasured("Verified changes have not been measured."),
    },
    sourceEvidence,
    review: {
      message:
        "Your page change is verified. Compare the next matching answer set before drawing a conclusion.",
      actionLabel: "Open results review",
      rewardPoints: snapshot.review.isError
        ? failed("The results review task could not be loaded.")
        : snapshot.review.data?.items[0]
          ? measured(snapshot.review.data.items[0].points)
          : notMeasured("No results review task is assigned."),
      businessResults: notMeasured("Analytics not connected."),
    },
    coverage: {
      successfulAnswers:
        successfulAnswers === undefined
          ? notMeasured("No successful answer sample exists.")
          : measured(successfulAnswers),
      failedAttempts:
        failedAttempts === undefined
          ? notMeasured("No answer attempt has been recorded.")
          : measured(failedAttempts),
      approvedQuestions:
        approvedQuestions === undefined
          ? notMeasured("No approved question set exists.")
          : measured(approvedQuestions),
      engines:
        engines === undefined
          ? notMeasured("No engine coverage has been measured.")
          : measured(engines),
      lastChecked: lastChecked
        ? measured(lastChecked)
        : notMeasured("No completed measurement has been recorded."),
    },
    observedEngines,
  };
}

export function board09ResultFromQueries(
  snapshot: Board09QuerySnapshot,
): V2LiveResult<Board09Data> {
  if (isLoading(snapshot)) return { state: { kind: "loading" } };
  if (!snapshot.brandId) {
    return {
      state: { kind: "not-measured", reason: "Select a brand before opening visibility evidence." },
    };
  }
  if (snapshot.rate.isError) {
    return { state: { kind: "error", message: "Visibility measurement could not be loaded." } };
  }
  if (snapshot.hero.isError) {
    return { state: { kind: "error", message: "Visibility summary could not be loaded." } };
  }
  const rate = snapshot.rate.data;
  if (!rate) return { state: { kind: "loading" } };
  if (rate.measured === 0) {
    return {
      state: {
        kind: "not-measured",
        reason: "No controlled answer has been measured for this brand.",
      },
    };
  }

  const data = mapBoard09Queries(snapshot);
  const staleAsOf = snapshot.hero.data?.lastScanAt ?? rate.weeks[rate.weeks.length - 1]?.weekStart;
  const stale = [
    snapshot.rate,
    snapshot.hero,
    snapshot.cited,
    snapshot.engines,
    snapshot.approvedQuestions,
    snapshot.work,
    snapshot.awards,
    snapshot.summary,
    snapshot.review,
  ].some((query) => query.isStale);
  if (stale && staleAsOf) {
    return {
      state: {
        kind: "stale",
        reason: "Visibility evidence is older than the current query window.",
        asOf: staleAsOf,
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}

export function useBoard09Data(): V2LiveResult<Board09Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const rate = useVisibilityMentionRate(selectedBrandId);
  const since = observationWindowStart(rate.data);
  const hero = useVisibilityHero(selectedBrandId, since);
  const cited = useCitedUrls(selectedBrandId, since);
  const engines = useEngineRankings(selectedBrandId, since);
  const approvedQuestions = useApprovedQuestions(selectedBrandId);
  const work = useVerifiedWork(selectedBrandId);
  const awards = useAwardEvents(selectedBrandId);
  const summary = useWorkSummary(selectedBrandId);
  const review = useReviewTask(selectedBrandId);

  return board09ResultFromQueries({
    brandId: selectedBrandId,
    loading: brandsLoading,
    rate,
    hero,
    cited,
    engines,
    approvedQuestions,
    work,
    awards,
    summary,
    review,
  });
}
