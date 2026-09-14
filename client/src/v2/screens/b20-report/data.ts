// Live adapter for the /v2/visibility/report screen.
//
// Composes the same reads board 08 uses (mention rate, engine rankings, work
// summary, verified work) with one new endpoint,
// `GET /api/v2/visibility/report/:brandId` (server/routes/v2Reports.ts),
// that this board needs and nothing else returns: the top buyer-question
// table, the cited-domain breakdown, and the brand-omissions table.
//
// Recommendations and business results have no backing source anywhere in
// the API - see client/src/v2/data/visibilityEvidence.ts's header note. Both
// are rendered as an honest absence here, never a fabricated number.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import {
  observationWindowStart,
  useVisibilityMentionRate,
  type VisibilityMentionRate,
} from "@/v2/data/visibilityTrend";
import {
  useEngineRankings,
  useVerifiedWork,
  type EngineRanking,
} from "@/v2/data/visibilityEvidence";
import { useWorkSummary, type WorkSummaryView } from "@/v2/data/workSummary";
import type {
  Board20ChangeItem,
  Board20Data,
  Board20Domain,
  Board20Omission,
  Board20Progress,
  Board20Question,
  Board20Trend,
  Board20Value,
} from "./Screen";

// Mirrors server/services/v2Report.ts's ReportSummary.
export type V2ReportApi = {
  period: { start: string; end: string } | null;
  observedMentions: number;
  observedAttempts: number;
  citedWithLink: number;
  buyerQuestions: Array<{
    id: string;
    text: string;
    attempts: number;
    mentions: number;
    cited: number;
    engineCount: number;
  }>;
  citedDomains: Array<{ domain: string; citations: number; share: number }>;
  totalCitations: number;
  omissions: Array<{
    questionId: string;
    text: string;
    engineCount: number;
    engineTotal: number;
    competitorCount: number;
    competitorNames: string[];
  }>;
};

export type ReportNoteApi = { note: string; updatedAt: string | null };

async function readData<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

export function useV2Report(brandId: string) {
  return useQuery<V2ReportApi>({
    queryKey: ["v2", "visibility", "report", brandId],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<V2ReportApi>(`/api/v2/visibility/report/${encodeURIComponent(brandId)}`),
  });
}

export function useReportNote(brandId: string) {
  return useQuery<ReportNoteApi>({
    queryKey: ["v2", "visibility", "report", brandId, "note"],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<ReportNoteApi>(`/api/v2/visibility/report/${encodeURIComponent(brandId)}/note`),
  });
}

export function useSaveReportNote(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (note: string): Promise<ReportNoteApi> => {
      const response = await apiRequest(
        "PUT",
        `/api/v2/visibility/report/${encodeURIComponent(brandId)}/note`,
        { note },
      );
      const payload = (await response.json()) as { success: boolean; data: ReportNoteApi };
      return payload.data;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["v2", "visibility", "report", brandId, "note"], result);
    },
  });
}

type Board20AdapterState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-measured"; reason: string };

function measured<T>(value: T): Board20Value<T> {
  return { kind: "measured", value };
}

function notMeasured<T>(reason: string): Board20Value<T> {
  return { kind: "not-measured", reason };
}

function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function toTrend(rate: VisibilityMentionRate): Board20Value<Board20Trend> {
  const weeks = rate.weeks;
  if (weeks.every((week) => week.measured === 0)) {
    return notMeasured("Create a baseline before measuring visibility.");
  }
  const first = weeks[0]?.weekStart;
  const middle = weeks[Math.floor(weeks.length / 2)]?.weekStart;
  const last = weeks[weeks.length - 1]?.weekStart;
  if (!first || !middle || !last)
    return notMeasured("Create a baseline before measuring visibility.");
  return measured({
    points: weeks.map((week) => (week.measured > 0 ? week.cited : null)),
    xLabels: [formatDate(first), formatDate(middle), formatDate(last)],
  });
}

function toEngineComparison(
  rankings: readonly EngineRanking[] | undefined,
): Board20Value<readonly { engine: string; rate: number | null }[]> {
  if (!rankings) return notMeasured("No engine has answered in this period.");
  if (rankings.length === 0) return notMeasured("No engine has answered in this period.");
  return measured(
    rankings.map((platform) => ({
      engine: platform.aiPlatform,
      rate:
        platform.totalCount > 0
          ? Math.round((platform.citedCount / platform.totalCount) * 100)
          : null,
    })),
  );
}

function toBuyerQuestions(report: V2ReportApi): Board20Question[] {
  return report.buyerQuestions.map((question) => ({
    id: question.id,
    text: question.text,
    mentions: question.mentions,
    attempts: question.attempts,
    cited: question.cited,
    engineCount: question.engineCount,
  }));
}

function toCitedDomains(report: V2ReportApi): Board20Domain[] {
  return report.citedDomains.map((domain) => ({
    domain: domain.domain,
    citations: domain.citations,
    share: domain.share,
  }));
}

function toOmissions(report: V2ReportApi): Board20Omission[] {
  return report.omissions.map((omission) => ({
    questionId: omission.questionId,
    text: omission.text,
    engineCount: omission.engineCount,
    engineTotal: omission.engineTotal,
    competitorNames: omission.competitorNames,
  }));
}

function toCompletedChanges(
  verifiedWork: { items: Array<{ taskTitle: string; occurredAt: string }> } | undefined,
): Board20ChangeItem[] {
  if (!verifiedWork) return [];
  return verifiedWork.items
    .slice(0, 5)
    .map((item) => ({
      title: item.taskTitle,
      status: "Verified" as const,
      verifiedAt: formatDate(item.occurredAt),
    }));
}

function toProgress(summary: WorkSummaryView | undefined): Board20Value<Board20Progress> {
  if (!summary) return notMeasured("No work has been recorded for this brand yet.");
  return measured({
    level: summary.currentLevel.level,
    levelName: summary.currentLevel.name,
    pointsEarned: summary.points,
    pointsTarget: summary.nextThreshold ? summary.nextThreshold.points : null,
    nextLevelName: summary.nextThreshold
      ? `Level ${summary.nextThreshold.level} ${summary.nextThreshold.name}`
      : null,
  });
}

export function board20QueryResult(state: Board20AdapterState): V2LiveResult<Board20Data> {
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
  return error instanceof Error ? error.message : "The visibility report could not be loaded.";
}

export function useBoard20Data(): V2LiveResult<Board20Data> {
  const { selectedBrandId, isLoading: isBrandLoading } = useBrandSelection();
  const brandId = selectedBrandId;

  const rateQuery = useVisibilityMentionRate(brandId);
  const since = observationWindowStart(rateQuery.data);
  const rankingsQuery = useEngineRankings(brandId, since);
  const workSummaryQuery = useWorkSummary(brandId);
  const verifiedWorkQuery = useVerifiedWork(brandId);
  const reportQuery = useV2Report(brandId);
  const noteQuery = useReportNote(brandId);
  const saveNote = useSaveReportNote(brandId);

  if (isBrandLoading || !brandId) {
    return board20QueryResult(
      isBrandLoading
        ? { kind: "loading" }
        : { kind: "not-measured", reason: "No brand is selected." },
    );
  }

  const queries = [
    rateQuery,
    rankingsQuery,
    workSummaryQuery,
    verifiedWorkQuery,
    reportQuery,
    noteQuery,
  ] as const;
  const failedQuery = queries.find((query) => query.isError);
  if (failedQuery) {
    return board20QueryResult({ kind: "error", message: errorMessage(failedQuery.error) });
  }
  if (
    queries.some((query) => query.isPending) ||
    !rateQuery.data ||
    !reportQuery.data ||
    !noteQuery.data
  ) {
    return board20QueryResult({ kind: "loading" });
  }

  const report = reportQuery.data;
  const note = noteQuery.data;
  const rate = rateQuery.data;

  const data: Board20Data = {
    navigation: { brandId, mode: "guided" },
    period: report.period
      ? measured({ start: formatDate(report.period.start), end: formatDate(report.period.end) })
      : notMeasured("No observation period exists yet."),
    workCompleted:
      verifiedWorkQuery.data && verifiedWorkQuery.data.items.length > 0
        ? measured(verifiedWorkQuery.data.items.length)
        : notMeasured("No verified change has been recorded yet."),
    observedVisibility:
      report.observedAttempts > 0
        ? measured({ mentions: report.observedMentions, attempts: report.observedAttempts })
        : notMeasured("No answer was collected in this period."),
    citations:
      report.observedAttempts > 0
        ? measured({ count: report.citedWithLink, attempts: report.observedAttempts })
        : notMeasured("No answer was collected in this period."),
    businessResultsDetail:
      "Connect an analytics source to measure referral visits and qualified leads.",
    trend: toTrend(rate),
    engineComparison: toEngineComparison(rankingsQuery.data?.platforms),
    buyerQuestions: toBuyerQuestions(report),
    citedDomains: toCitedDomains(report),
    omissions: toOmissions(report),
    completedChanges: toCompletedChanges(verifiedWorkQuery.data),
    progress: toProgress(workSummaryQuery.data),
    reportNote: {
      value: note.note,
      savedAt: note.updatedAt ? formatDate(note.updatedAt) : null,
    },
    onSaveNote: (value: string) => saveNote.mutate(value),
    noteSaving: saveNote.isPending,
    onExport: (format) => exportReport(report, format),
  };

  const updatedAt = Math.min(
    ...queries.map((query) => query.dataUpdatedAt).filter((value) => value > 0),
  );
  if (Number.isFinite(updatedAt) && Date.now() - updatedAt > 24 * 60 * 60 * 1000) {
    return {
      state: {
        kind: "stale",
        reason: "The report may be out of date.",
        asOf: new Date(updatedAt).toISOString(),
      },
      data,
    };
  }

  return { state: { kind: "ready" }, data };
}

/** Downloads the already-loaded report as a real CSV or JSON file - no
 *  server export endpoint exists, so this builds the file client-side from
 *  the same data the page renders. */
function exportReport(report: V2ReportApi, format: "csv" | "json"): void {
  const filename = `visibility-report.${format}`;
  const content = format === "json" ? JSON.stringify(report, null, 2) : toCsv(report);
  const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function toCsv(report: V2ReportApi): string {
  const rows: string[][] = [
    ["Section", "Field 1", "Field 2", "Field 3", "Field 4"],
    ["Period start", report.period?.start ?? "", "", "", ""],
    ["Period end", report.period?.end ?? "", "", "", ""],
    [
      "Observed mentions",
      String(report.observedMentions),
      "of",
      String(report.observedAttempts),
      "attempts",
    ],
    [
      "Citations with a link",
      String(report.citedWithLink),
      "of",
      String(report.observedAttempts),
      "attempts",
    ],
    [],
    ["Buyer question", "Mentions", "Attempts", "Cited", "Engines"],
    ...report.buyerQuestions.map((q) => [
      q.text,
      String(q.mentions),
      String(q.attempts),
      String(q.cited),
      String(q.engineCount),
    ]),
    [],
    ["Cited domain", "Citations", "Share %", "", ""],
    ...report.citedDomains.map((d) => [d.domain, String(d.citations), String(d.share), "", ""]),
    [],
    [
      "Omitted question",
      "Engines with competitor",
      "Total engines",
      "Competitor count",
      "Competitors",
    ],
    ...report.omissions.map((o) => [
      o.text,
      String(o.engineCount),
      String(o.engineTotal),
      String(o.competitorCount),
      o.competitorNames.join("; "),
    ]),
  ];
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
