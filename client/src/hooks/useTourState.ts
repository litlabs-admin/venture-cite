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
  // `isReady`, not `!isLoading`. An empty TourState is indistinguishable from
  // "this user has never seen any tour", so acting on one before the real
  // state arrives re-fires everything the user already dismissed. isLoading
  // alone is not enough: it also goes false when the query ERRORS (a 401 on a
  // lapsed session, an offline reload), which would leave `{}` looking
  // authoritative. Only a payload we actually received counts.
  return {
    state: (data?.data ?? {}) as TourState,
    isLoading,
    isReady: data?.data !== undefined,
  };
}

export function useTourStatePatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (op: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", "/api/tours/state", op);
      return (await res.json()) as StateResp;
    },
    // A dropped PATCH means the tour re-fires forever with nothing on screen
    // to say why. Never silent.
    onError: (err) => {
      console.error("[tours] failed to persist tour state", err);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: STATE_KEY });
    },
  });
}
