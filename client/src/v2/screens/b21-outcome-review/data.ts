import type { V2LiveResult } from "@/v2/contracts/screen";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useWorkSummary } from "@/v2/data/workSummary";
import { useReviewTask, useVerifiedWork } from "@/v2/data/visibilityEvidence";
import {
  hasNoObservations,
  latestObservedWeek,
  useVisibilityMentionRate,
} from "@/v2/data/visibilityTrend";
import type { ReviewMetric, ReviewProgressData } from "../b10-results-review/shared/ReviewTemplate";
import type { Board21Data, Board21ReferralRow } from "./Screen";

// Live: selected brand, verified work, visibility observations, review points,
// and progress. Pending backend work: referral, outcome, attribution, and CRM data.

function measured<T>(value: T): ReviewMetric<T> {
  return { kind: "measured", value };
}

function notMeasured<T>(): ReviewMetric<T> {
  return { kind: "not-measured" };
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date.toISOString());
}

function updatedAt(queries: readonly { dataUpdatedAt: number }[]): string {
  const latest = Math.max(...queries.map((query) => query.dataUpdatedAt));
  return new Date(latest > 0 ? latest : Date.now()).toISOString();
}

function progressFromSummary(
  summary: ReturnType<typeof useWorkSummary>["data"],
): ReviewProgressData {
  return {
    level: summary ? measured(summary.currentLevel.level) : notMeasured<number>(),
    name: summary ? measured(summary.currentLevel.name) : notMeasured<string>(),
    points: summary ? measured(summary.points) : notMeasured<number>(),
    target: summary?.nextThreshold ? measured(summary.nextThreshold.points) : notMeasured<number>(),
    rate: summary?.nextThreshold
      ? measured(Math.round((summary.points / summary.nextThreshold.points) * 100))
      : notMeasured<number>(),
    next: summary?.nextThreshold
      ? measured(summary.nextThreshold)
      : notMeasured<{ level: number; name: string; points: number }>(),
  };
}

export function useBoard21Data(): V2LiveResult<Board21Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const brandId = selectedBrandId ?? "";
  const rateQuery = useVisibilityMentionRate(brandId);
  const workQuery = useVerifiedWork(brandId);
  const reviewTaskQuery = useReviewTask(brandId);
  const summaryQuery = useWorkSummary(brandId);
  const queries = [rateQuery, workQuery, reviewTaskQuery, summaryQuery] as const;

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!brandId) {
    return { state: { kind: "not-measured", reason: "Select a brand before reviewing outcomes." } };
  }
  if (queries.some((query) => query.isPending)) return { state: { kind: "loading" } };
  if (queries.some((query) => query.isError)) {
    return { state: { kind: "error", message: "Visibility or outcome data could not be loaded." } };
  }

  const rate = rateQuery.data;
  const week = latestObservedWeek(rate?.weeks);
  const hasObservations = !hasNoObservations(rate?.weeks);
  const change = workQuery.data?.items[0];
  const changeDate = change ? dateOnly(change.occurredAt) : week?.weekStart;
  const observationStart = changeDate ?? week?.weekStart;
  const observationEnd = observationStart ? addDays(observationStart, 27) : undefined;
  const reviewTask = reviewTaskQuery.data?.items[0];
  const summary = summaryQuery.data;
  const data: Board21Data = {
    context: { brandId, mode: summary?.mode ?? "guided" },
    brand: { name: selectedBrand?.name ?? "Selected brand" },
    reviewDate: changeDate ? measured(changeDate) : notMeasured<string>(),
    completedChange: {
      title: change ? measured(change.taskTitle) : notMeasured<string>(),
      date: changeDate ? measured(changeDate) : notMeasured<string>(),
      summary: change?.reason ? measured(change.reason) : notMeasured<string>(),
    },
    observationWindow: {
      start: observationStart ? measured(observationStart) : notMeasured<string>(),
      end: observationEnd ? measured(observationEnd) : notMeasured<string>(),
      days: observationStart ? measured(28) : notMeasured<number>(),
    },
    visibility: {
      mentions: hasObservations && rate ? measured(rate.cited) : notMeasured<number>(),
      denominator: hasObservations && rate ? measured(rate.measured) : notMeasured<number>(),
    },
    referralRows: notMeasured<readonly Board21ReferralRow[]>(),
    verifiedReferralSourceCount: notMeasured<number>(),
    qualifiedInquiries: notMeasured<number>(),
    demoRequests: notMeasured<number>(),
    attributedReferralUrls: notMeasured<readonly string[]>(),
    crmOpportunityIds: "",
    outcomeNotes: "",
    crmConnections: { hubspot: "not-connected", salesforce: "not-connected" },
    evidenceStrength: notMeasured<"Moderate" | "Strong" | "Weak">(),
    unconfirmedInquiries: notMeasured<number>(),
    confirmedDemoRequests: notMeasured<number>(),
    crmOpportunityCount: { kind: "not-connected" },
    progress: progressFromSummary(summary),
    awardPoints: reviewTask ? measured(reviewTask.points) : notMeasured<number>(),
  };

  const stale = queries.some((query) => query.isFetching && query.data !== undefined);
  return stale
    ? {
        state: { kind: "stale", reason: "Outcome data is refreshing.", asOf: updatedAt(queries) },
        data,
      }
    : { state: { kind: "ready" }, data };
}
