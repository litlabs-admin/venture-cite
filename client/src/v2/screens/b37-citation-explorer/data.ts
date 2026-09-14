// Live adapter for the /v2/visibility/citations screen.
//
// One read: `GET /api/v2/visibility/citations/:brandId`
// (server/routes/v2Questions.ts). Source-link verification and outreach
// opportunities have no backing table anywhere in the product - the screen
// states that absence rather than inventing an "unverified URLs" or "source
// opportunity" count.

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board37Data, Board37Record } from "./Screen";

export type V2CitationExplorerApi = {
  captureDate: string | null;
  summary: { mentions: number; citations: number; failures: number; attempts: number };
  records: Array<{
    id: string;
    questionId: string | null;
    question: string;
    engine: string;
    state: "cited" | "mentioned" | "not_mentioned" | "failed";
    brandMentioned: boolean;
    brandCited: boolean;
    sourceDomain: string | null;
    sourceType: string | null;
    sourceUrl: string | null;
    capturedAt: string;
    excerpt: string | null;
  }>;
  sourceMix: Array<{ type: string; count: number }>;
  firstPartyShare: number | null;
  thirdPartyShare: number | null;
};

async function readData<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

export function useV2CitationExplorer(brandId: string) {
  return useQuery<V2CitationExplorerApi>({
    queryKey: ["v2", "visibility", "citations", brandId],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readData<V2CitationExplorerApi>(
        `/api/v2/visibility/citations/${encodeURIComponent(brandId)}`,
      ),
  });
}

function toRecords(api: V2CitationExplorerApi): Board37Record[] {
  return api.records.map((record) => ({
    id: record.id,
    question: record.question,
    engine: record.engine,
    state: record.state,
    sourceDomain: record.sourceDomain,
    sourceType: record.sourceType,
    sourceUrl: record.sourceUrl,
    capturedAt: record.capturedAt,
    excerpt: record.excerpt,
  }));
}

type Board37AdapterState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-measured"; reason: string };

function board37QueryResult(state: Board37AdapterState): V2LiveResult<Board37Data> {
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
  return error instanceof Error ? error.message : "The citation explorer could not be loaded.";
}

export function useBoard37Data(): V2LiveResult<Board37Data> {
  const { selectedBrandId, isLoading: isBrandLoading } = useBrandSelection();
  const brandId = selectedBrandId;
  const explorerQuery = useV2CitationExplorer(brandId);

  if (isBrandLoading || !brandId) {
    return board37QueryResult(
      isBrandLoading
        ? { kind: "loading" }
        : { kind: "not-measured", reason: "No brand is selected." },
    );
  }
  if (explorerQuery.isError) {
    return board37QueryResult({ kind: "error", message: errorMessage(explorerQuery.error) });
  }
  if (!explorerQuery.data) {
    return board37QueryResult({ kind: "loading" });
  }

  const api = explorerQuery.data;
  const data: Board37Data = {
    navigation: { brandId, mode: "expert" },
    captureDate: api.captureDate,
    summary: api.summary,
    records: toRecords(api),
    sourceMix: api.sourceMix,
    firstPartyShare: api.firstPartyShare,
    thirdPartyShare: api.thirdPartyShare,
  };

  const updatedAt = explorerQuery.dataUpdatedAt;
  if (updatedAt > 0 && Date.now() - updatedAt > 24 * 60 * 60 * 1000) {
    return {
      state: {
        kind: "stale",
        reason: "The citation explorer may be out of date.",
        asOf: new Date(updatedAt).toISOString(),
      },
      data,
    };
  }

  return { state: { kind: "ready" }, data };
}
