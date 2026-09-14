// Live adapter for the /v2/visibility/questions/$questionId screen.
//
// One read, `GET /api/v2/visibility/questions/:brandId/:questionId`
// (server/routes/v2Questions.ts), and one real write, the existing
// `PATCH /api/brand-prompts/:brandId/prompts/:promptId/pause`
// (server/routes/prompts.ts) - so "Pause measurement" is a genuine toggle,
// not a dead button.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board36Data, Board36TrendPoint, Board36Value } from "./Screen";

export type V2QuestionDetailApi = {
  question: {
    id: string;
    text: string;
    status: string;
    paused: boolean;
    category: string | null;
    journeyStage: string | null;
    region: string;
    createdAt: string;
  };
  trend: Array<{
    weekStart: string;
    mentionRate: number | null;
    citationRate: number | null;
    failureRate: number | null;
  }>;
  metrics: {
    mentionCount: number;
    citationCount: number;
    failedCount: number;
    attemptCount: number;
  };
  engineRecords: Array<{
    engine: string;
    total: number;
    answered: number;
    mentioned: number;
    cited: number;
    failed: number;
  }>;
  citedUrls: Array<{ url: string; citations: number; engines: string[] }>;
  competitors: Array<{ name: string; mentions: number; engines: string[] }>;
};

async function readData<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

export function useV2QuestionDetail(brandId: string, questionId: string) {
  return useQuery<V2QuestionDetailApi>({
    queryKey: ["v2", "visibility", "questions", brandId, questionId],
    enabled: Boolean(brandId) && Boolean(questionId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<V2QuestionDetailApi>(
        `/api/v2/visibility/questions/${encodeURIComponent(brandId)}/${encodeURIComponent(questionId)}`,
      ),
  });
}

export function useTogglePauseQuestion(brandId: string, questionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paused: boolean) => {
      const response = await apiRequest(
        "PATCH",
        `/api/brand-prompts/${encodeURIComponent(brandId)}/prompts/${encodeURIComponent(questionId)}/pause`,
        { paused },
      );
      return (await response.json()) as { success: boolean };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["v2", "visibility", "questions", brandId, questionId],
      });
      void queryClient.invalidateQueries({ queryKey: ["v2", "visibility", "questions", brandId] });
    },
  });
}

function measured<T>(value: T): Board36Value<T> {
  return { kind: "measured", value };
}
function notMeasured<T>(reason: string): Board36Value<T> {
  return { kind: "not-measured", reason };
}

function toTrend(trend: V2QuestionDetailApi["trend"]): Board36Value<readonly Board36TrendPoint[]> {
  if (trend.every((point) => point.mentionRate === null && point.citationRate === null)) {
    return notMeasured("No answer has been collected for this question yet.");
  }
  return measured(trend);
}

function healthOf(api: V2QuestionDetailApi): Board36Data["health"] {
  if (api.metrics.attemptCount === 0) return "not-measured";
  const mentionRate = api.metrics.mentionCount / api.metrics.attemptCount;
  const failureRate = api.metrics.failedCount / api.metrics.attemptCount;
  return mentionRate >= 0.5 && failureRate < 0.3 ? "good" : "needs-attention";
}

type Board36AdapterState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-measured"; reason: string };

function board36QueryResult(state: Board36AdapterState): V2LiveResult<Board36Data> {
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
  return error instanceof Error ? error.message : "The question detail could not be loaded.";
}

export function useBoard36Data(questionId: string | undefined): V2LiveResult<Board36Data> {
  const { selectedBrandId, isLoading: isBrandLoading } = useBrandSelection();
  const brandId = selectedBrandId;
  const detailQuery = useV2QuestionDetail(brandId, questionId ?? "");
  const toggle = useTogglePauseQuestion(brandId, questionId ?? "");

  if (isBrandLoading || !brandId) {
    return board36QueryResult(
      isBrandLoading
        ? { kind: "loading" }
        : { kind: "not-measured", reason: "No brand is selected." },
    );
  }
  if (!questionId) {
    return board36QueryResult({ kind: "not-measured", reason: "No question was selected." });
  }
  if (detailQuery.isError) {
    return board36QueryResult({ kind: "error", message: errorMessage(detailQuery.error) });
  }
  if (!detailQuery.data) {
    return board36QueryResult({ kind: "loading" });
  }

  const api = detailQuery.data;
  const denominator = api.metrics.attemptCount;
  const data: Board36Data = {
    navigation: { brandId, mode: "expert" },
    question: api.question,
    trend: toTrend(api.trend),
    metrics: {
      mentionRate:
        denominator > 0
          ? measured(Math.round((api.metrics.mentionCount / denominator) * 100))
          : notMeasured("No attempt recorded yet."),
      citationRate:
        denominator > 0
          ? measured(Math.round((api.metrics.citationCount / denominator) * 100))
          : notMeasured("No attempt recorded yet."),
      failureRate:
        denominator > 0
          ? measured(Math.round((api.metrics.failedCount / denominator) * 100))
          : notMeasured("No attempt recorded yet."),
      mentionCount: api.metrics.mentionCount,
      citationCount: api.metrics.citationCount,
      failedCount: api.metrics.failedCount,
      attemptCount: api.metrics.attemptCount,
    },
    engineRecords: api.engineRecords,
    citedUrls: api.citedUrls.map((row) => ({
      url: row.url,
      citations: row.citations,
      engineCount: row.engines.length,
    })),
    competitors: api.competitors.map((row) => ({
      name: row.name,
      mentions: row.mentions,
      engineCount: row.engines.length,
    })),
    health: healthOf(api),
    onTogglePause: () => toggle.mutate(!api.question.paused),
    pauseSaving: toggle.isPending,
  };

  const updatedAt = detailQuery.dataUpdatedAt;
  if (updatedAt > 0 && Date.now() - updatedAt > 24 * 60 * 60 * 1000) {
    return {
      state: {
        kind: "stale",
        reason: "This question's evidence may be out of date.",
        asOf: new Date(updatedAt).toISOString(),
      },
      data,
    };
  }

  return { state: { kind: "ready" }, data };
}
