// "What I know" drawer summary (business-context.md) - one round trip for
// the brief status line, a handful of recent memories and whether
// preferences are set.
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { AskMemoryView } from "@shared/ask/memory";

export type AskDrawerData = {
  brief: { status: "draft" | "accepted" | "dismissed"; hasAnyContent: boolean };
  memories: AskMemoryView[];
  memoryCount: number;
  hasPreferences: boolean;
};

export function useAskDrawer(brandId: string | null, enabled: boolean) {
  const query = useQuery<{ success: boolean; data: AskDrawerData }>({
    queryKey: ["/api/ask/drawer", brandId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/ask/drawer?brandId=${encodeURIComponent(brandId!)}`,
      );
      return res.json();
    },
    enabled: enabled && !!brandId,
  });

  return { data: query.data?.data ?? null, isLoading: query.isLoading };
}
