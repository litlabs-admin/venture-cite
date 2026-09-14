import { useQuery } from "@tanstack/react-query";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board19Data } from "./Screen";
import {
  fetchContentTaskApi,
  mapContentTaskResponse,
  resolveContentTaskResult,
  type AdapterResolution,
} from "../b06-buyer-guide-editor/shared/contentTaskAdapter";

// Live: task metadata, policy points, the selected brand's current draft, and its URL.
// Pending: task-bound buyer-question facts, claim references, and publication verification.
export function mapBoard19Response(
  taskPayload: unknown,
  articlePayload: unknown,
  brandId: string,
): Board19Data | undefined {
  return mapContentTaskResponse("services", { taskPayload, articlePayload }, brandId);
}

export function resolveBoard19Result(
  input: AdapterResolution<Board19Data>,
): V2LiveResult<Board19Data> {
  return resolveContentTaskResult(input, "Unable to load the content task.");
}

export function useBoard19Data(taskId?: string): V2LiveResult<Board19Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const query = useQuery({
    queryKey: ["v2", "my-work", "content-task", "b19", selectedBrandId, taskId ?? ""],
    enabled: Boolean(selectedBrandId),
    meta: { suppressErrorToast: true },
    queryFn: ({ signal }) => fetchContentTaskApi({ brandId: selectedBrandId, taskId, signal }),
  });

  if (!selectedBrandId) return resolveBoard19Result({ status: "not-measured" });
  if (brandsLoading || query.isPending) return resolveBoard19Result({ status: "loading" });
  if (query.isError) return resolveBoard19Result({ status: "error" });

  const data = query.data
    ? mapBoard19Response(query.data.taskPayload, query.data.articlePayload, selectedBrandId)
    : undefined;
  if (!data) return { state: { kind: "empty", reason: "No content task is available." } };
  const dataUpdatedAt = new Date(query.dataUpdatedAt).toISOString();
  return resolveBoard19Result({ status: "ready", data, dataUpdatedAt });
}
