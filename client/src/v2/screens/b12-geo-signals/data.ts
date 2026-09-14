// Live: the recommendations request confirms brand access. Pending: GEO score history, source counts,
// source mix, evidence gaps, and opportunity records have no current read projection.
import { useQuery } from "@tanstack/react-query";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board12Data } from "./Screen";

export const BOARD12_NOT_MEASURED_REASON =
  "GEO signal source categories and opportunity records are not available from the current API.";

type RecommendationsEnvelope = {
  success: boolean;
  data: unknown;
};

function isRecommendationsEnvelope(value: unknown): value is RecommendationsEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { success?: unknown; data?: unknown };
  return typeof candidate.success === "boolean" && "data" in candidate;
}

async function readRecommendations(brandId: string): Promise<RecommendationsEnvelope> {
  const response = await fetch(`/api/brands/${encodeURIComponent(brandId)}/recommendations`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Recommendations request failed with status ${response.status}.`);
  const payload: unknown = await response.json();
  if (!isRecommendationsEnvelope(payload) || !payload.success) {
    throw new Error("The recommendations response was not successful.");
  }
  return payload;
}

export function mapBoard12ApiResponse(
  _payload: RecommendationsEnvelope,
): V2LiveResult<Board12Data> {
  return { state: { kind: "not-measured", reason: BOARD12_NOT_MEASURED_REASON } };
}

export function useBoard12Data(): V2LiveResult<Board12Data> {
  const { selectedBrandId } = useBrandSelection();
  const query = useQuery<RecommendationsEnvelope, Error>({
    enabled: Boolean(selectedBrandId),
    meta: { suppressErrorToast: true },
    queryFn: () => readRecommendations(selectedBrandId),
    queryKey: ["v2", "diagnostics", "geo-signals", selectedBrandId],
    retry: false,
  });

  if (!selectedBrandId) {
    return { state: { kind: "not-measured", reason: "No brand is selected." } };
  }
  if (query.isPending) return { state: { kind: "loading" } };
  if (query.isError) return { state: { kind: "error", message: query.error.message } };
  return mapBoard12ApiResponse(query.data);
}
