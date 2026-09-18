// Shared brand memory (business-context.md Memory tab). Mutations
// invalidate both this tab's own list and the "What I know" drawer's
// summary (useAskDrawer.ts), which shows the same data at a smaller size.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { AskMemoryType, AskMemoryView } from "@shared/ask/memory";

const MEMORIES_KEY = (brandId: string | null) => ["/api/ask/memories", brandId] as const;

export function useAskMemories(brandId: string | null) {
  const queryClient = useQueryClient();

  const memoriesQuery = useQuery<{ success: boolean; data: { memories: AskMemoryView[] } }>({
    queryKey: MEMORIES_KEY(brandId),
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/ask/memories?brandId=${encodeURIComponent(brandId!)}`,
      );
      return res.json();
    },
    enabled: !!brandId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: MEMORIES_KEY(brandId) });
    queryClient.invalidateQueries({ queryKey: ["/api/ask/drawer", brandId] });
  };

  const addMemory = useMutation({
    mutationFn: async (input: { type: AskMemoryType; content: string }) => {
      const res = await apiRequest("POST", "/api/ask/memories", { ...input, brandId });
      const json = await res.json();
      return json.data.memory as AskMemoryView;
    },
    onSuccess: invalidateAll,
  });

  const editMemory = useMutation({
    mutationFn: async (input: { id: string; type?: AskMemoryType; content?: string }) => {
      const { id, ...patch } = input;
      const res = await apiRequest("PATCH", `/api/ask/memories/${id}`, { ...patch, brandId });
      const json = await res.json();
      return json.data.memory as AskMemoryView;
    },
    onSuccess: invalidateAll,
  });

  const forgetMemory = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/ask/memories/${id}/forget`, { brandId });
    },
    onSuccess: invalidateAll,
  });

  return {
    memories: memoriesQuery.data?.data.memories ?? [],
    isLoading: memoriesQuery.isLoading,
    error: memoriesQuery.error,
    addMemory,
    editMemory,
    forgetMemory,
  };
}
