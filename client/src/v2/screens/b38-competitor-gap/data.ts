import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board38Data, Board38Value } from "./Screen";

const mentionedBrandSchema = z.object({
  name: z.string(),
  cited: z.boolean(),
  rank: z.number().nullable(),
});

const measurementSchema = z.object({
  brandPromptId: z.string().nullable(),
  aiPlatform: z.string(),
  checkedAt: z.string(),
  isCited: z.boolean(),
  rank: z.number().nullable(),
  mentionedBrands: z.array(mentionedBrandSchema),
});

const competitorMeasurementSchema = z.object({
  competitorId: z.string(),
  brandPromptId: z.string(),
  aiPlatform: z.string(),
  checkedAt: z.string(),
  isCited: z.boolean(),
  rank: z.number().nullable(),
  citingOutletUrl: z.string().nullable(),
  citationContext: z.string().nullable(),
});

const responseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    brand: z.object({ id: z.string(), name: z.string() }),
    generatedAt: z.string(),
    scope: z.object({
      totalTrackedPrompts: z.number(),
      windowDaysFetched: z.number(),
      defaultWindowDays: z.number(),
      market: z.string().nullable(),
    }),
    prompts: z.array(
      z.object({ id: z.string(), text: z.string(), category: z.string().nullable() }),
    ),
    competitors: z.array(
      z.object({ id: z.string(), name: z.string(), nameVariations: z.array(z.string()) }),
    ),
    measurements: z.array(measurementSchema),
    competitorMeasurements: z.array(competitorMeasurementSchema),
  }),
});

type ApiResponse = z.infer<typeof responseSchema>;

const measured = <T>(value: T): Board38Value<T> => ({ kind: "measured", value });
const notMeasured = <T>(reason: string): Board38Value<T> => ({ kind: "not-measured", reason });

function buildBoard38Data(brandId: string, response: ApiResponse["data"]): Board38Data {
  return {
    navigation: { brandId, mode: "expert" },
    brandName: measured(response.brand.name),
    market: response.scope.market
      ? measured(response.scope.market)
      : notMeasured("This brand has not recorded a single tracked market."),
    totalTrackedPrompts: measured(response.scope.totalTrackedPrompts),
    prompts: response.prompts,
    competitors: response.competitors,
    measurements: response.measurements.filter(
      (m): m is typeof m & { brandPromptId: string } => m.brandPromptId !== null,
    ),
    competitorMeasurements: response.competitorMeasurements,
  };
}

async function readCompetitorGap(brandId: string): Promise<ApiResponse["data"]> {
  const response = await apiRequest("GET", `/api/v2/competitor-gap/${encodeURIComponent(brandId)}`);
  const payload: unknown = await response.json();
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) throw new Error("The competitor gap response has an invalid shape.");
  return parsed.data.data;
}

export function useBoard38Data(): V2LiveResult<Board38Data> {
  const { selectedBrandId, selectedBrand } = useBrandSelection();
  const brandId = selectedBrandId || undefined;

  const query = useQuery({
    queryKey: ["v2", "diagnostics", "competitor-gap", brandId],
    enabled: Boolean(brandId),
    staleTime: 30_000,
    meta: { suppressErrorToast: true },
    queryFn: () => {
      if (!brandId) throw new Error("A brand is required to load the competitor gap comparison.");
      return readCompetitorGap(brandId);
    },
  });

  if (!brandId || !selectedBrand) {
    return {
      state: { kind: "not-measured", reason: "Select a brand before comparing competitors." },
    };
  }
  if (query.isPending) return { state: { kind: "loading" } };
  if (query.isError) {
    return {
      state: {
        kind: "error",
        message:
          query.error instanceof Error
            ? query.error.message
            : "The competitor gap comparison could not be loaded.",
      },
    };
  }

  const response = query.data;
  if (response.prompts.length === 0) {
    return {
      state: { kind: "empty", reason: "No buyer questions are tracked for this brand yet." },
    };
  }

  const data = buildBoard38Data(brandId, response);
  if (data.measurements.length === 0) {
    return {
      state: {
        kind: "not-measured",
        reason: "No citation checks have run for this brand's buyer questions yet.",
      },
    };
  }

  if (query.isStale) {
    return {
      state: {
        kind: "stale",
        reason: "The comparison may be out of date.",
        asOf: response.generatedAt,
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}
