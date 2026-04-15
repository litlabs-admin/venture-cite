import { useQuery } from "@tanstack/react-query";

// Runtime config surfaced by the server at GET /api/config. Currently just
// `testMode` — whether USE_TEST_MODEL is on, so the client can render the
// Test Mode badge next to AI action buttons. Cached 5 minutes since the
// flag only changes on server restart.
export function useServerConfig() {
  return useQuery<{ success: boolean; data: { testMode: boolean } }>({
    queryKey: ["/api/config"],
    staleTime: 5 * 60 * 1000,
  });
}
