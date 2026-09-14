// Live: brand name/domain, tracked-question count, visibility data window,
// cited-source count, and tracked-competitor count - all read from
// GET /api/v2/geo-assistant/context/:brandId (server/routes/v2Assistant.ts).
// The conversation itself is not fetched here: it starts empty and is driven
// live by client/src/v2/screens/b22-geo-assistant/chat.ts once the shell
// mounts, exactly like the sidebar's existing AI Tutor panel.

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board22Data, Board22Value } from "./Screen";

export type GeoAssistantContextResponse = {
  brand: { name: string; domain: string | null };
  dataAvailable: {
    trackedQuestions: number;
    window: { start: string; end: string } | null;
    citedSourceCount: number;
    competitorCount: number;
  };
  savedConversations: Array<{ id: string; title: string; updatedAt: string }>;
};

function measured<T>(value: T): Board22Value<T> {
  return { kind: "measured", value };
}

function notMeasured<T>(reason: string): Board22Value<T> {
  return { kind: "not-measured", reason };
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function useGeoAssistantContext(brandId: string) {
  return useQuery<GeoAssistantContextResponse>({
    queryKey: ["v2", "geo-assistant", "context", brandId],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/v2/geo-assistant/context/${encodeURIComponent(brandId)}`,
      );
      const payload = (await response.json()) as { success: boolean; data: GeoAssistantContextResponse };
      return payload.data;
    },
  });
}

/** Pure mapping, kept separate from the hook above so it can be unit tested
 *  without a QueryClient or router context. */
export function mapGeoAssistantContext(
  raw: GeoAssistantContextResponse,
  brandId: string,
): Board22Data {
  return {
    context: { brandId, mode: "guided" },
    brand: {
      name: raw.brand.name,
      domain: raw.brand.domain
        ? measured(raw.brand.domain)
        : notMeasured("No website is set for this brand."),
    },
    dataAvailable: {
      trackedQuestions:
        raw.dataAvailable.trackedQuestions > 0
          ? measured(raw.dataAvailable.trackedQuestions)
          : notMeasured("No question set is tracked for this brand yet."),
      visibilityWindow: raw.dataAvailable.window
        ? measured(
            `${formatDate(raw.dataAvailable.window.start)} - ${formatDate(raw.dataAvailable.window.end)}`,
          )
        : notMeasured("No answer has been measured for this brand yet."),
      citedSources:
        raw.dataAvailable.citedSourceCount > 0
          ? measured(raw.dataAvailable.citedSourceCount)
          : notMeasured("No cited source has been recorded yet."),
      competitors:
        raw.dataAvailable.competitorCount > 0
          ? measured(raw.dataAvailable.competitorCount)
          : notMeasured("No competitor is tracked for this brand yet."),
    },
    conversation: { messages: [] },
    savedConversations: raw.savedConversations,
  };
}

export function useBoard22Data(): V2LiveResult<Board22Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const context = useGeoAssistantContext(selectedBrandId);

  if (!selectedBrandId) {
    if (brandsLoading) return { state: { kind: "loading" } };
    return {
      state: { kind: "not-measured", reason: "Select a brand to use the GEO assistant." },
    };
  }
  if (context.isPending) return { state: { kind: "loading" } };
  if (context.isError) {
    return { state: { kind: "error", message: "GEO assistant data could not be loaded." } };
  }

  const data = mapGeoAssistantContext(context.data, selectedBrandId);

  if (context.isStale) {
    return {
      state: {
        kind: "stale",
        reason: "GEO assistant context is older than the refresh window.",
        asOf: new Date().toISOString(),
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}
