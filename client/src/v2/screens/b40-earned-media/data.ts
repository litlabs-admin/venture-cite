// Live: every listicle that excludes the brand, every community-post draft,
// every existing brand mention, and every domain a tracked buyer question's
// AI answer cites while the brand is absent (derived from geo_rankings). No
// dedicated opportunity table exists yet - server/routes/v2Opportunities.ts
// derives this list from those four real tables on every read. There is no
// backend for a scheduled "next review" scan, so that rail item stays
// descriptive text rather than a fabricated date.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board40Actions, Board40Data, EarnedMediaStatus } from "./Screen";

const levelSchema = z.enum(["Low", "Medium", "High"]);
const statusSchema = z.enum(["Not started", "In progress", "Completed", "Not a fit"]);

const opportunitySchema = z.object({
  id: z.string(),
  sourceType: z.enum(["listicle", "community", "mention", "citation"]),
  sourceTypeLabel: z.string(),
  sourceName: z.string(),
  sourceUrl: z.string().nullable(),
  topicMatch: levelSchema,
  affectedQuestionCount: z.number().int(),
  relationship: z.enum(["No contact", "Warm contact", "Existing contact"]),
  evidenceType: z.string(),
  effort: levelSchema,
  confidence: levelSchema,
  status: statusSchema,
  canUpdateStatus: z.boolean(),
  taskKey: z.string(),
  detail: z.object({
    headline: z.string(),
    quote: z.string().nullable(),
    quoteAttribution: z.string().nullable(),
    observedAt: z.string().nullable(),
  }),
});

const boardSchema = z.object({
  counts: z.object({
    all: z.number().int(),
    listicle: z.number().int(),
    community: z.number().int(),
    mention: z.number().int(),
    citation: z.number().int(),
  }),
  outreachCounts: z.object({
    notStarted: z.number().int(),
    inProgress: z.number().int(),
    completed: z.number().int(),
    notFit: z.number().int(),
  }),
  opportunities: z.array(opportunitySchema),
});

const boardEnvelope = z.object({ success: z.literal(true), data: boardSchema });
type BoardResponse = z.infer<typeof boardSchema>;

async function readBoard(brandId: string): Promise<BoardResponse> {
  const response = await apiRequest(
    "GET",
    `/api/v2/opportunities/earned-media/${encodeURIComponent(brandId)}`,
  );
  const parsed = boardEnvelope.safeParse(await response.json());
  if (!parsed.success)
    throw new Error("The earned media opportunities response has an invalid shape.");
  return parsed.data.data;
}

function mapData(brandId: string, board: BoardResponse): Board40Data {
  return {
    brandId,
    mode: "expert",
    counts: board.counts,
    outreachCounts: board.outreachCounts,
    opportunities: board.opportunities,
  };
}

export function useBoard40Data(): V2LiveResult<Board40Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const query = useQuery({
    queryKey: ["v2", "my-work", "earned-media", selectedBrandId],
    enabled: Boolean(selectedBrandId),
    meta: { suppressErrorToast: true },
    queryFn: () => readBoard(selectedBrandId),
  });

  if (!selectedBrandId && !brandsLoading) {
    return { state: { kind: "empty", reason: "No brand is selected." } };
  }
  if (brandsLoading || query.isPending) {
    return { state: { kind: "loading" } };
  }
  if (query.isError) {
    return { state: { kind: "error", message: "Unable to load earned media opportunities." } };
  }
  if (!query.data) {
    return {
      state: { kind: "not-measured", reason: "Earned media opportunities are not available." },
    };
  }

  const data = mapData(selectedBrandId, query.data);
  if (query.isFetching && query.dataUpdatedAt > 0) {
    return {
      state: {
        kind: "stale",
        reason: "Earned media opportunities are refreshing.",
        asOf: new Date(query.dataUpdatedAt).toISOString(),
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}

export function useBoard40Actions(): Board40Actions {
  const { selectedBrandId } = useBrandSelection();
  const queryClient = useQueryClient();
  const queryKey = ["v2", "my-work", "earned-media", selectedBrandId];

  const createTaskMutation = useMutation({
    mutationFn: (opportunityId: string) =>
      apiRequest(
        "POST",
        `/api/v2/opportunities/earned-media/${encodeURIComponent(selectedBrandId)}/tasks`,
        { opportunityId },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["v2", "work"] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ opportunityId, status }: { opportunityId: string; status: EarnedMediaStatus }) =>
      apiRequest(
        "PATCH",
        `/api/v2/opportunities/earned-media/${encodeURIComponent(selectedBrandId)}/status`,
        { opportunityId, status },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    createTask: (opportunityId) => createTaskMutation.mutate(opportunityId),
    updateStatus: (opportunityId, status) => updateStatusMutation.mutate({ opportunityId, status }),
    refresh: () => void queryClient.invalidateQueries({ queryKey }),
    pendingTaskId: createTaskMutation.isPending ? (createTaskMutation.variables ?? null) : null,
    pendingStatusId: updateStatusMutation.isPending
      ? (updateStatusMutation.variables?.opportunityId ?? null)
      : null,
  };
}
