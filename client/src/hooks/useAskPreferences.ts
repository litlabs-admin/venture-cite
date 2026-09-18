// Private per-user answer preferences (business-context.md's "Your
// preferences" tab). Not brand-scoped - one row per user, matching
// Trakkr's own "Only you" framing.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { AskPreferencesView, SaveAskPreferencesInput } from "@shared/ask/preferences";

const PREFERENCES_KEY = ["/api/ask/preferences"] as const;

export function useAskPreferences() {
  const queryClient = useQueryClient();

  const preferencesQuery = useQuery<{
    success: boolean;
    data: { preferences: AskPreferencesView };
  }>({
    queryKey: PREFERENCES_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ask/preferences");
      return res.json();
    },
  });

  const save = useMutation({
    mutationFn: async (input: SaveAskPreferencesInput) => {
      const res = await apiRequest("PUT", "/api/ask/preferences", input);
      const json = await res.json();
      return json.data.preferences as AskPreferencesView;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(PREFERENCES_KEY, { success: true, data: { preferences } });
      queryClient.invalidateQueries({ queryKey: ["/api/ask/drawer"] });
    },
  });

  return {
    preferences: preferencesQuery.data?.data.preferences ?? null,
    isLoading: preferencesQuery.isLoading,
    save,
  };
}
