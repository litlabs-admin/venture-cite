// Live: every published BOFU page, FAQ and article mapped against tracked
// buyer questions by shared keywords, with visibility gap read from
// geo_rankings citations against the page's own URL. There is no
// page-to-question coverage table (see docs/superpowers/analysis/
// 2026-09-14-screens/02-backend-coverage.md row 123), so
// server/routes/v2Opportunities.ts derives coverage, gap and evidence
// quality from real columns on every read - see
// server/services/work/opportunityBoards.ts for the exact formulas.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board41Actions, Board41Data } from "./Screen";

const levelSchema = z.enum(["Low", "Medium", "High"]);

const pageSchema = z.object({
  id: z.string(),
  sourceType: z.enum(["bofu", "faq", "article"]),
  title: z.string(),
  path: z.string().nullable(),
  type: z.string(),
  questionsCovered: z.number().int(),
  coveredQuestionIds: z.array(z.string()),
  visibilityGap: levelSchema.nullable(),
  evidenceQuality: z.enum(["Weak", "Fair", "Good", "Strong"]).nullable(),
  freshness: z.string(),
  recommendedChange: z.string(),
  effort: z.enum(["S", "M", "L"]),
  status: z.enum(["High priority", "Needs update", "Minor update", "Up to date"]),
  taskKey: z.string(),
});

const boardSchema = z.object({
  pages: z.array(pageSchema),
  unmappedQuestions: z.array(z.object({ id: z.string(), prompt: z.string() })),
  coverageGapCount: z.number().int(),
  duplicateTopicCount: z.number().int(),
  pagesWithoutEvidenceCount: z.number().int(),
  prioritizedAction: z
    .object({
      pageId: z.string(),
      pageName: z.string(),
      question: z.string().nullable(),
      recommendedChange: z.string(),
    })
    .nullable(),
});

const boardEnvelope = z.object({ success: z.literal(true), data: boardSchema });
type BoardResponse = z.infer<typeof boardSchema>;

async function readBoard(brandId: string): Promise<BoardResponse> {
  const response = await apiRequest(
    "GET",
    `/api/v2/opportunities/content/${encodeURIComponent(brandId)}`,
  );
  const parsed = boardEnvelope.safeParse(await response.json());
  if (!parsed.success) throw new Error("The content opportunities response has an invalid shape.");
  return parsed.data.data;
}

function mapData(brandId: string, board: BoardResponse): Board41Data {
  return {
    brandId,
    mode: "expert",
    pages: board.pages.map((page) => ({
      id: page.id,
      sourceType: page.sourceType,
      title: page.title,
      path: page.path,
      type: page.type,
      questionsCovered: page.questionsCovered,
      visibilityGap: page.visibilityGap,
      evidenceQuality: page.evidenceQuality,
      freshness: page.freshness,
      recommendedChange: page.recommendedChange,
      effort: page.effort,
      status: page.status,
    })),
    unmappedQuestions: board.unmappedQuestions,
    coverageGapCount: board.coverageGapCount,
    duplicateTopicCount: board.duplicateTopicCount,
    pagesWithoutEvidenceCount: board.pagesWithoutEvidenceCount,
    prioritizedAction: board.prioritizedAction,
  };
}

export function useBoard41Data(): V2LiveResult<Board41Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const query = useQuery({
    queryKey: ["v2", "my-work", "content-opportunities", selectedBrandId],
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
    return { state: { kind: "error", message: "Unable to load content opportunities." } };
  }
  if (!query.data) {
    return { state: { kind: "not-measured", reason: "Content opportunities are not available." } };
  }

  const data = mapData(selectedBrandId, query.data);
  if (query.isFetching && query.dataUpdatedAt > 0) {
    return {
      state: {
        kind: "stale",
        reason: "Content opportunities are refreshing.",
        asOf: new Date(query.dataUpdatedAt).toISOString(),
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}

export function useBoard41Actions(): Board41Actions {
  const { selectedBrandId } = useBrandSelection();
  const queryClient = useQueryClient();
  const queryKey = ["v2", "my-work", "content-opportunities", selectedBrandId];

  const createTaskMutation = useMutation({
    mutationFn: (opportunityId: string) =>
      apiRequest(
        "POST",
        `/api/v2/opportunities/content/${encodeURIComponent(selectedBrandId)}/tasks`,
        {
          opportunityId,
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["v2", "work"] });
    },
  });

  return {
    createTask: (pageId) => createTaskMutation.mutate(pageId),
    refresh: () => void queryClient.invalidateQueries({ queryKey }),
    pendingTaskId: createTaskMutation.isPending ? (createTaskMutation.variables ?? null) : null,
  };
}
