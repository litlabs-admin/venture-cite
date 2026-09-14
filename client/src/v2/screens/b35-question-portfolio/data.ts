// Live adapter for the /v2/visibility/questions screen.
//
// One read: `GET /api/v2/visibility/questions/:brandId`
// (server/routes/v2Questions.ts), which already returns every field this
// table and rail need. Market and language columns are left out on purpose -
// `brand_prompts` has no such columns, see the longer note in
// server/services/v2QuestionViews.ts.

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board35Data, Board35Question, Board35Value } from "./Screen";

export type V2PortfolioApi = {
  questions: Array<{
    id: string;
    text: string;
    journeyStage: string | null;
    category: string | null;
    region: string;
    audienceNames: string[];
    status: "tracked" | "suggested" | "archived";
    paused: boolean;
    activeEngineCount: number;
    latestVisibilityCount: number;
    latestVisibilityDenominator: number;
    citationRate: number | null;
    change30d: number | null;
    createdAt: string;
  }>;
  setHealth: { score: number | null; verdict: string | null } | null;
  allowance: { used: number; limit: number };
};

async function readData<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

export function useV2Portfolio(brandId: string) {
  return useQuery<V2PortfolioApi>({
    queryKey: ["v2", "visibility", "questions", brandId],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<V2PortfolioApi>(`/api/v2/visibility/questions/${encodeURIComponent(brandId)}`),
  });
}

function toQuestions(api: V2PortfolioApi): Board35Question[] {
  return api.questions.map((question) => ({
    id: question.id,
    text: question.text,
    journeyStage: question.journeyStage,
    audienceNames: question.audienceNames,
    category: question.category,
    region: question.region,
    activeEngineCount: question.activeEngineCount,
    latestVisibilityCount: question.latestVisibilityCount,
    latestVisibilityDenominator: question.latestVisibilityDenominator,
    citationRate: question.citationRate,
    change30d: question.change30d,
    status: question.status,
    paused: question.paused,
  }));
}

function toSetHealth(
  setHealth: V2PortfolioApi["setHealth"],
): Board35Value<{ score: number; verdict: string }> {
  if (!setHealth || setHealth.score === null || setHealth.verdict === null) {
    return { kind: "not-measured", reason: "No set-health audit has run for this brand yet." };
  }
  return { kind: "measured", value: { score: setHealth.score, verdict: setHealth.verdict } };
}

type Board35AdapterState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-measured"; reason: string };

function board35QueryResult(state: Board35AdapterState): V2LiveResult<Board35Data> {
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
  return error instanceof Error
    ? error.message
    : "The buyer question portfolio could not be loaded.";
}

export function useBoard35Data(): V2LiveResult<Board35Data> {
  const { selectedBrandId, isLoading: isBrandLoading } = useBrandSelection();
  const brandId = selectedBrandId;
  const portfolioQuery = useV2Portfolio(brandId);

  if (isBrandLoading || !brandId) {
    return board35QueryResult(
      isBrandLoading
        ? { kind: "loading" }
        : { kind: "not-measured", reason: "No brand is selected." },
    );
  }
  if (portfolioQuery.isError) {
    return board35QueryResult({ kind: "error", message: errorMessage(portfolioQuery.error) });
  }
  if (!portfolioQuery.data) {
    return board35QueryResult({ kind: "loading" });
  }

  const api = portfolioQuery.data;
  const data: Board35Data = {
    navigation: { brandId, mode: "expert" },
    questions: toQuestions(api),
    setHealth: toSetHealth(api.setHealth),
    allowance: api.allowance,
  };

  const updatedAt = portfolioQuery.dataUpdatedAt;
  if (updatedAt > 0 && Date.now() - updatedAt > 24 * 60 * 60 * 1000) {
    return {
      state: {
        kind: "stale",
        reason: "The question portfolio may be out of date.",
        asOf: new Date(updatedAt).toISOString(),
      },
      data,
    };
  }

  return { state: { kind: "ready" }, data };
}
