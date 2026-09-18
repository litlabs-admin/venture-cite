// Business brief data (business-context.md Business brief tab). One
// always-editable form - see shared/ask/brief.ts's header for why there is
// no separate "Use this brief / Edit first / Dismiss" review state here.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { AskBriefView, SaveAskBriefInput } from "@shared/ask/brief";

const BRIEF_KEY = (brandId: string | null) => ["/api/ask/brief", brandId] as const;

export function useAskBrief(brandId: string | null) {
  const queryClient = useQueryClient();

  const briefQuery = useQuery<{ success: boolean; data: { brief: AskBriefView } }>({
    queryKey: BRIEF_KEY(brandId),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/ask/brief?brandId=${encodeURIComponent(brandId!)}`);
      return res.json();
    },
    enabled: !!brandId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: BRIEF_KEY(brandId) });

  const save = useMutation({
    mutationFn: async (input: Omit<SaveAskBriefInput, "brandId">) => {
      const res = await apiRequest("PUT", "/api/ask/brief", { ...input, brandId });
      const json = await res.json();
      return json.data.brief as AskBriefView;
    },
    onSuccess: (brief) => {
      queryClient.setQueryData(BRIEF_KEY(brandId), { success: true, data: { brief } });
      // The brief write path also updates brands.description/targetAudience
      // (source of truth) - invalidate every view that reads those, not
      // just this tab's own cache.
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
    },
  });

  const generateDraft = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ask/brief/generate", { brandId });
      return res.json();
    },
    onSuccess: invalidate,
  });

  return {
    brief: briefQuery.data?.data.brief ?? null,
    isLoading: briefQuery.isLoading,
    error: briefQuery.error,
    save,
    generateDraft,
    invalidate,
  };
}
