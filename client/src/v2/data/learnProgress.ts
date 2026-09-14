import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Learn's one read and one write. Namespaced `["v2", "learn", ...]` for the
// reason workSummary.ts gives for its own keys: the query client is a
// singleton shared with the live dashboard, so a key shaped like the live
// app's would let an invalidation from this tree reach it.
//
// Not brand-scoped: lesson completion is a fact about the user taking the
// course (server/routes/v2Learn.ts), not about any one brand, so the query
// key carries no brandId and stays stable across a brand switch.

export type V2LearnCompletion = { lessonId: string; completedAt: string; brandId: string | null };

async function readJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await apiRequest("POST", url, body);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

const PROGRESS_QUERY_KEY = ["v2", "learn", "progress"] as const;

export function useLearnProgress() {
  return useQuery<{ completions: V2LearnCompletion[] }>({
    queryKey: PROGRESS_QUERY_KEY,
    meta: { suppressErrorToast: true },
    queryFn: () => readJson<{ completions: V2LearnCompletion[] }>("/api/v2/learn/progress"),
  });
}

export function useCompleteLesson() {
  const queryClient = useQueryClient();
  return useMutation<
    { completions: V2LearnCompletion[] },
    Error,
    { lessonId: string; brandId: string | null }
  >({
    mutationFn: ({ lessonId, brandId }) =>
      postJson<{ completions: V2LearnCompletion[] }>("/api/v2/learn/complete", {
        lessonId,
        brandId,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(PROGRESS_QUERY_KEY, data);
    },
  });
}
