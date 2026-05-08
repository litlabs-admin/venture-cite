// client/src/hooks/useTourState.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import type { TourState } from "../tours/types";

const STATE_KEY = ["/api/tours/state"] as const;

interface StateResp {
  success: boolean;
  data: TourState;
}

export function useTourState() {
  const { data, isLoading } = useQuery<StateResp>({
    queryKey: STATE_KEY,
    staleTime: 30_000,
  });
  return { state: (data?.data ?? {}) as TourState, isLoading };
}

export function useTourStatePatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (op: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", "/api/tours/state", op);
      return (await res.json()) as StateResp;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: STATE_KEY });
    },
  });
}
