// Live: article title and body, the newest article revision, and work-task points.
// Pending backend work: published date, claim-level diffs, claim evidence, and approval actions.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import { useWorkTasks, type WorkTaskPage } from "@/v2/data/workTasks";
import type { Board15Content, Board15Data, Board15TextPart, Board15Value } from "./Screen";

const articleSchema = z.object({
  id: z.string(),
  brandId: z.string(),
  title: z.string().nullable(),
  content: z.string().nullable(),
  status: z.string(),
  updatedAt: z.string(),
});

const revisionSchema = z.object({
  id: z.string(),
  articleId: z.string(),
  content: z.string(),
  createdAt: z.string(),
});

const articlesEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.array(articleSchema),
});

const revisionsEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.array(revisionSchema),
});

type ArticleView = z.infer<typeof articleSchema>;
type RevisionView = z.infer<typeof revisionSchema>;

function requiredBrandId(brandId: string | undefined): string {
  if (!brandId) throw new Error("A brand is required to load revision review.");
  return brandId;
}

async function readArticles(brandId: string | undefined): Promise<ArticleView[]> {
  const response = await apiRequest(
    "GET",
    `/api/articles?brandId=${encodeURIComponent(requiredBrandId(brandId))}&status=ready&limit=1`,
  );
  const payload = articlesEnvelopeSchema.parse(await response.json());
  return payload.data;
}

async function readRevisions(articleId: string | undefined): Promise<RevisionView[]> {
  if (!articleId) throw new Error("An article is required to load revisions.");
  const response = await apiRequest("GET", `/api/articles/${encodeURIComponent(articleId)}/revisions`);
  const payload = revisionsEnvelopeSchema.parse(await response.json());
  return payload.data;
}

function measured<T>(value: T): Board15Value<T> {
  return { kind: "measured", value };
}

function unavailable<T>(reason: string): Board15Value<T> {
  return { kind: "not-measured", reason };
}

function textValue(value: string | null): Board15Value<readonly Board15TextPart[]> {
  return value && value.trim().length > 0
    ? measured([{ text: value, changed: false }])
    : unavailable("The content endpoint returned no value.");
}

function liveContent(article: ArticleView, revision: RevisionView): {
  current: Board15Content;
  proposed: Board15Content;
} {
  return {
    current: {
      title: textValue(article.title),
      paragraph: textValue(article.content),
      section: unavailable("The article endpoint does not project section headings."),
      questions: unavailable("The article endpoint does not project buyer questions."),
    },
    proposed: {
      title: unavailable("The revision endpoint does not project a proposed title."),
      paragraph: textValue(revision.content),
      section: unavailable("The revision endpoint does not project section headings."),
      questions: unavailable("The revision endpoint does not project buyer questions."),
    },
  };
}

function buildLiveData(
  article: ArticleView,
  revision: RevisionView,
  tasks: WorkTaskPage,
): Board15Data {
  const content = liveContent(article, revision);
  const task = tasks.items.find((item) => item.type === "improve_page_for_buyer_need");

  return {
    context: measured("Live data"),
    revision: {
      currentPublishedAt: unavailable("The article projection has no published date."),
      proposedEditedAt: measured(revision.createdAt),
      changeCount: unavailable("Claim-level change counts are not stored."),
      currentContent: content.current,
      proposedContent: content.proposed,
      approvalState: "blocked",
      rewardPoints: task ? measured(task.points) : unavailable("No matching revision task is available."),
    },
    claims: unavailable("Claim-level review data is not stored."),
  };
}

function isPending(...queries: ReadonlyArray<{ isPending: boolean }>): boolean {
  return queries.some((query) => query.isPending);
}

export function useBoard15Data(): V2LiveResult<Board15Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const articlesQuery = useQuery({
    queryKey: ["v2", "revision-review", "articles", selectedBrandId],
    enabled: Boolean(selectedBrandId),
    meta: { suppressErrorToast: true },
    staleTime: 30_000,
    queryFn: () => readArticles(selectedBrandId),
  });
  const articleId = articlesQuery.data?.[0]?.id;
  const revisionsQuery = useQuery({
    queryKey: ["v2", "revision-review", "revisions", selectedBrandId, articleId ?? ""],
    enabled: Boolean(selectedBrandId) && Boolean(articleId),
    meta: { suppressErrorToast: true },
    staleTime: 30_000,
    queryFn: () => readRevisions(articleId),
  });
  const tasksQuery = useWorkTasks(selectedBrandId);

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId) {
    return { state: { kind: "not-measured", reason: "No brand is selected." } };
  }
  if (articlesQuery.isError || revisionsQuery.isError || tasksQuery.isError) {
    return { state: { kind: "error", message: "Revision review data could not be loaded." } };
  }
  if (isPending(articlesQuery, tasksQuery) || (Boolean(articleId) && revisionsQuery.isPending)) {
    return { state: { kind: "loading" } };
  }
  if (!articlesQuery.data || articlesQuery.data.length === 0) {
    return { state: { kind: "empty", reason: "No proposed revision exists for this brand." } };
  }
  if (!revisionsQuery.data || revisionsQuery.data.length === 0) {
    return { state: { kind: "empty", reason: "No proposed revision exists for this article." } };
  }
  if (!tasksQuery.data) {
    return { state: { kind: "error", message: "Work-task data could not be loaded." } };
  }

  const article = articlesQuery.data[0];
  const revision = revisionsQuery.data[0];
  if (!article || !revision) {
    return { state: { kind: "empty", reason: "No proposed revision exists for this brand." } };
  }

  const data = buildLiveData(article, revision, tasksQuery.data);
  const asOf = revision.createdAt;
  const stale = articlesQuery.isStale || revisionsQuery.isStale || tasksQuery.isStale;
  return stale
    ? { state: { kind: "stale", reason: "Revision review data may be out of date.", asOf }, data }
    : { state: { kind: "ready" }, data };
}
