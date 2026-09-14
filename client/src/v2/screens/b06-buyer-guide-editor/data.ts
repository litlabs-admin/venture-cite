import { useQuery } from "@tanstack/react-query";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board06Data } from "./Screen";
import {
  fetchContentTaskApi,
  mapContentTaskResponse,
  resolveContentTaskResult,
  type AdapterResolution,
} from "./shared/contentTaskAdapter";

// Live: task metadata, policy points, the selected brand's current draft, and its URL.
// Pending: task-bound buyer-question facts, claim references, and publication verification.
export function mapBoard06Response(
  taskPayload: unknown,
  articlePayload: unknown,
  brandId: string,
): Board06Data | undefined {
  return mapContentTaskResponse("buyer-guide", { taskPayload, articlePayload }, brandId);
}

export function resolveBoard06Result(
  input: AdapterResolution<Board06Data>,
): V2LiveResult<Board06Data> {
  return resolveContentTaskResult(input, "Unable to load the buyer guide task.");
}

export function useBoard06Data(taskId?: string): V2LiveResult<Board06Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const query = useQuery({
    queryKey: ["v2", "my-work", "content-task", "b06", selectedBrandId, taskId ?? ""],
    enabled: Boolean(selectedBrandId),
    meta: { suppressErrorToast: true },
    queryFn: ({ signal }) => fetchContentTaskApi({ brandId: selectedBrandId, taskId, signal }),
  });

  if (!selectedBrandId) return resolveBoard06Result({ status: "not-measured" });
  if (brandsLoading || query.isPending) return resolveBoard06Result({ status: "loading" });
  if (query.isError) return resolveBoard06Result({ status: "error" });

  const data = query.data
    ? mapBoard06Response(query.data.taskPayload, query.data.articlePayload, selectedBrandId)
    : undefined;
  if (!data) return { state: { kind: "empty", reason: "No buyer guide task is available." } };
  const dataUpdatedAt = new Date(query.dataUpdatedAt).toISOString();
  return resolveBoard06Result({ status: "ready", data, dataUpdatedAt });
}
