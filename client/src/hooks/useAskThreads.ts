// Thread list / create / archive / restore for the Ask workspace. Deliberately
// NOT useChatbot.ts - see docs/ask-feature/07-integration-and-hardening.md §0
// (independence decision). Same shape as the tutor's thread-list half by
// necessity (same underlying problem), copied rather than shared.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type AskThreadSummary = {
  id: string;
  title: string;
  brandId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  pendingActionCount: number;
};

const THREADS_KEY = (brandId: string | null) => ["/api/ask/threads", brandId] as const;

export function useAskThreads(opts: { enabled: boolean; brandId: string | null }) {
  const { enabled, brandId } = opts;
  const queryClient = useQueryClient();

  const threadsQuery = useQuery<{ success: boolean; data: { threads: AskThreadSummary[] } }>({
    queryKey: THREADS_KEY(brandId),
    queryFn: async () => {
      const qs = brandId ? `?brandId=${encodeURIComponent(brandId)}` : "";
      const res = await apiRequest("GET", `/api/ask/threads${qs}`);
      return res.json();
    },
    enabled,
    staleTime: 15_000,
  });

  const createThread = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ask/threads", { brandId });
      const json = await res.json();
      return json.data.thread as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY(brandId) });
    },
  });

  const archiveThread = useMutation({
    mutationFn: async (threadId: string) => {
      await apiRequest("DELETE", `/api/ask/threads/${threadId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY(brandId) });
    },
  });

  // Undo for archiveThread - the archive itself is a soft delete
  // (server/ask/storage.ts's archivedAt), so restoring is just clearing it
  // back out through the existing POST .../restore route.
  const restoreThread = useMutation({
    mutationFn: async (threadId: string) => {
      await apiRequest("POST", `/api/ask/threads/${threadId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY(brandId) });
    },
  });

  const renameThread = useMutation({
    mutationFn: async (input: { threadId: string; title: string }) => {
      await apiRequest("PATCH", `/api/ask/threads/${input.threadId}`, { title: input.title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY(brandId) });
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: THREADS_KEY(brandId) });

  return {
    threads: threadsQuery.data?.data.threads ?? [],
    isLoading: threadsQuery.isLoading,
    error: threadsQuery.error,
    createThread,
    archiveThread,
    restoreThread,
    renameThread,
    invalidate,
  };
}
