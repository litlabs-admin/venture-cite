import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { GoalKey } from "./goalCatalog";

type SavedGoal = {
  id: string;
  goalKey: GoalKey;
  title: string;
  statement: string;
  desiredOutcome: string;
};

async function postGoal(brandId: string, goalKey: GoalKey): Promise<SavedGoal> {
  const response = await apiRequest("POST", `/api/brands/${encodeURIComponent(brandId)}/goals`, {
    goalKey,
  });
  const payload = (await response.json()) as { success: boolean; data: SavedGoal };
  return payload.data;
}

/** Saves the chosen goal via `POST /api/brands/:brandId/goals` and
 *  invalidates the `v2 work` cache so `/work/summary` re-reads with the new
 *  goal - which is what moves the Today dispatch off board 33. */
export function useSetBrandGoal(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation<SavedGoal, Error, GoalKey>({
    mutationFn: (goalKey) => postGoal(brandId, goalKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["v2", "work"] });
    },
  });
}
