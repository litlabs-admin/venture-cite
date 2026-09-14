// Live: the observation rate, verified work, review task, award history, and
// progress summary. Pending backend work: business result data and capability
// requirement counts.
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useWorkSummary } from "@/v2/data/workSummary";
import { useAwardEvents, useReviewTask, useVerifiedWork } from "@/v2/data/visibilityEvidence";
import {
  hasNoObservations,
  latestObservedWeek,
  useVisibilityMentionRate,
} from "@/v2/data/visibilityTrend";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { ReviewMetric } from "./shared/ReviewTemplate";
import type { Board10Data } from "./Screen";

function measured<T>(value: T): ReviewMetric<T> {
  return { kind: "measured", value };
}

function notMeasured<T>(): ReviewMetric<T> {
  return { kind: "not-measured" };
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
}

function updatedAt(queries: readonly { dataUpdatedAt: number }[]): string {
  const latest = Math.max(...queries.map((query) => query.dataUpdatedAt));
  return new Date(latest > 0 ? latest : Date.now()).toISOString();
}

export function useBoard10Data(): V2LiveResult<Board10Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const brandId = selectedBrandId ?? "";
  const rateQuery = useVisibilityMentionRate(brandId);
  const workQuery = useVerifiedWork(brandId);
  const awardQuery = useAwardEvents(brandId);
  const reviewTaskQuery = useReviewTask(brandId);
  const summaryQuery = useWorkSummary(brandId);
  const queries = [rateQuery, workQuery, awardQuery, reviewTaskQuery, summaryQuery] as const;

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!brandId) {
    return { state: { kind: "not-measured", reason: "Select a brand before reviewing results." } };
  }
  if (queries.some((query) => query.isPending)) return { state: { kind: "loading" } };
  if (queries.some((query) => query.isError)) {
    return { state: { kind: "error", message: "Visibility or review data could not be loaded." } };
  }

  const rate = rateQuery.data;
  const period = latestObservedWeek(rate?.weeks);
  const hasObservations = !hasNoObservations(rate?.weeks);
  const reviewTask = reviewTaskQuery.data?.items[0];
  const summary = summaryQuery.data;
  const awardedEvents = (awardQuery.data?.items ?? []).filter(
    (event) => event.award?.awarded && event.award.awardStatus === "awarded",
  );
  const data: Board10Data = {
    context: { brandId, mode: summary?.mode ?? "guided" },
    review: {
      periodStart: period ? measured(period.weekStart) : notMeasured<string>(),
      periodEnd: period ? measured(addDays(period.weekStart, 6)) : notMeasured<string>(),
      verifiedChanges: measured(workQuery.data?.items.length ?? 0),
      mentions: hasObservations && rate ? measured(rate.cited) : notMeasured<number>(),
      successfulAnswers: hasObservations && rate ? measured(rate.measured) : notMeasured<number>(),
      businessResultsState: "not-connected",
      decision: null,
      notes: "",
      awardPoints: reviewTask ? measured(reviewTask.points) : notMeasured<number>(),
    },
    progress: {
      level: summary ? measured(summary.currentLevel.level) : notMeasured<number>(),
      name: summary ? measured(summary.currentLevel.name) : notMeasured<string>(),
      points: summary ? measured(summary.points) : notMeasured<number>(),
      target: summary?.nextThreshold
        ? measured(summary.nextThreshold.points)
        : notMeasured<number>(),
      rate: summary?.nextThreshold
        ? measured(Math.round((summary.points / summary.nextThreshold.points) * 100))
        : notMeasured<number>(),
      next: summary?.nextThreshold
        ? measured(summary.nextThreshold)
        : notMeasured<{ level: number; name: string; points: number }>(),
      completedRequirements: notMeasured<number>(),
      requiredRequirements: notMeasured<number>(),
      awardHistory: awardedEvents.flatMap((event) =>
        event.award ? [{ label: event.taskTitle, points: measured(event.award.points) }] : [],
      ),
    },
  };

  const stale = queries.some((query) => query.isFetching && query.data !== undefined);
  return stale
    ? {
        state: {
          kind: "stale",
          reason: "Review data is refreshing.",
          asOf: updatedAt(queries),
        },
        data,
      }
    : { state: { kind: "ready" }, data };
}
