// Live values: task URL, task points, next observation, fetched evidence time,
// and a 200 status from the existing work and site-health reads.
// Pending backend work: the versioned publication check, approved revision,
// live page content, canonical expectation, fact preservation, and indexability.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board16CheckResult, Board16Data, Board16Value } from "./Screen";

const taskState = z.enum([
  "suggested",
  "accepted",
  "in_progress",
  "submitted",
  "verified",
  "waiting_for_observation",
  "dismissed",
  "not_applicable",
  "reopened",
]);

const taskType = z.literal("improve_page_for_buyer_need");

const evidenceSchema = z.object({
  role: z.string(),
  kind: z.string(),
  status: z.string(),
  sourceUrl: z.string().nullable(),
  finalUrl: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  retrievedAt: z.string().nullable(),
  observedAt: z.string().nullable(),
  structuredFinding: z.unknown(),
});

const taskShape = {
  id: z.string(),
  brandId: z.string(),
  taskKey: z.string(),
  taskVersion: z.number().int(),
  type: taskType,
  state: taskState,
  revision: z.number().int(),
  title: z.string(),
  desiredResult: z.string(),
  buyerNeed: z.string().nullable(),
  recommendedChange: z.string(),
  reason: z.string().nullable(),
  confidence: z.number().nullable(),
  effort: z.number().int().nullable(),
  points: z.number().int(),
  nextCheckAt: z.string().nullable(),
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completionRule: z.unknown().nullable().optional(),
  measurementScope: z.unknown().nullable().optional(),
};

const taskSummarySchema = z.object(taskShape);
const taskDetailSchema = taskSummarySchema.extend({
  evidence: z.array(evidenceSchema).optional(),
  history: z.array(z.unknown()).optional(),
});

const articleSchema = z.object({
  id: z.string(),
  brandId: z.string(),
  title: z.string().nullable(),
  content: z.string().nullable(),
  externalUrl: z.string().nullable(),
});

const revisionSchema = z.object({
  id: z.string(),
  articleId: z.string(),
  content: z.string(),
  source: z.string(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});

const siteHealthPageSchema = z.object({
  url: z.string(),
  statusCode: z.number().int().nullable(),
  status: z.string(),
  errorKind: z.string().nullable(),
  contentType: z.string().nullable(),
  factCount: z.number().int(),
  severity: z.string(),
  findingIds: z.array(z.string()),
});

const siteHealthPagesSchema = z.object({
  runId: z.string().nullable(),
  pages: z.array(siteHealthPageSchema),
});

const contentChangeSchema = z.object({
  kind: z.literal("content_change"),
  label: z.string(),
  changeId: z.string(),
  pageUrl: z.string().url(),
  buyerNeed: z.string(),
  publishedAt: z.string(),
});

export type Board16ApiTask = z.infer<typeof taskDetailSchema>;
export type Board16ApiResponse = {
  task: Board16ApiTask;
  articles: z.infer<typeof articleSchema>[];
  revisions: z.infer<typeof revisionSchema>[];
  pages: z.infer<typeof siteHealthPagesSchema>;
};

type TaskPage = { items: z.infer<typeof taskSummarySchema>[]; nextCursor: string | null };

function measured<T>(value: T): Board16Value<T> {
  return { kind: "measured", value };
}

function notMeasured<T>(reason: string): Board16Value<T> {
  return { kind: "not-measured", reason };
}

function readContentChange(task: Board16ApiTask): z.infer<typeof contentChangeSchema> | undefined {
  for (const evidence of task.evidence ?? []) {
    const parsed = contentChangeSchema.safeParse(evidence.structuredFinding);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

function readFetchedAt(task: Board16ApiTask): string | undefined {
  return task.evidence?.find((evidence) => evidence.retrievedAt)?.retrievedAt ?? undefined;
}

function findPage(
  pages: z.infer<typeof siteHealthPagesSchema>,
  url: string | undefined,
): z.infer<typeof siteHealthPageSchema> | undefined {
  if (!url) return undefined;
  return pages.pages.find((page) => page.url === url);
}

function statusForPage(
  page: z.infer<typeof siteHealthPageSchema> | undefined,
): Board16Value<Board16CheckResult> {
  if (!page || page.statusCode === null) {
    return notMeasured("The site-health read has no status code for this page.");
  }
  return measured(page.statusCode === 200 ? "Verified" : "Mismatch");
}

export function mapBoard16ApiResponse(response: Board16ApiResponse): Board16Data {
  const contentChange = readContentChange(response.task);
  const page = findPage(response.pages, contentChange?.pageUrl);
  const fetchedAt = readFetchedAt(response.task);
  const url = contentChange?.pageUrl;
  const urlStatusCode = page?.statusCode ?? undefined;
  const fetchedState: Board16Value<string> =
    page?.statusCode === 200
      ? measured("Page fetched successfully")
      : notMeasured("The existing reads do not provide a publication-check result.");

  return {
    publication: {
      url: url ? measured(url) : notMeasured("The submitted change has no page URL."),
      expectedCanonicalUrl: notMeasured(
        "The publication check does not return an expected canonical URL.",
      ),
      fetchedAt: fetchedAt
        ? measured(fetchedAt)
        : notMeasured("The publication check has no fetch time."),
      fetchState: fetchedState,
      nextObservationAt: response.task.nextCheckAt
        ? measured(response.task.nextCheckAt)
        : notMeasured("The task has no next observation date."),
      rewardPoints: measured(response.task.points),
    },
    revision: {
      approvedAt: notMeasured("No approved revision is linked to this task."),
      heading: notMeasured("No approved page heading is linked to this task."),
      content: notMeasured("No approved page content is linked to this task."),
    },
    livePage: {
      heading: notMeasured("The existing reads do not fetch the live page heading."),
      content: notMeasured("The existing reads do not fetch the live page content."),
    },
    checks: {
      urlStatusCode:
        urlStatusCode === undefined
          ? notMeasured("The site-health read has no status code for this page.")
          : measured(urlStatusCode),
      urlReachable: statusForPage(page),
      changedText: notMeasured("The publication check service is not available."),
      approvedFacts: notMeasured("The publication check service is not available."),
      canonical: notMeasured("The publication check service is not available."),
      indexability: notMeasured("The publication check service is not available."),
    },
    task: {
      buyerNeed: response.task.buyerNeed
        ? measured(response.task.buyerNeed)
        : contentChange?.buyerNeed
          ? measured(contentChange.buyerNeed)
          : notMeasured("The task has no buyer need."),
      evidence: notMeasured("The work projection does not return the evidence label."),
    },
  };
}

const taskPageEnvelope = z.object({
  success: z.literal(true),
  data: z.object({ items: z.array(taskSummarySchema), nextCursor: z.string().nullable() }),
});
const taskDetailEnvelope = z.object({ success: z.literal(true), data: taskDetailSchema });
const articlesEnvelope = z.object({ success: z.literal(true), data: z.array(articleSchema) });
const revisionsEnvelope = z.object({ success: z.literal(true), data: z.array(revisionSchema) });
const siteHealthEnvelope = z.object({ success: z.literal(true), data: siteHealthPagesSchema });

async function readData<T>(
  url: string,
  envelope: z.ZodType<{ success: boolean; data: T }>,
): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload: unknown = await response.json();
  const parsed = envelope.safeParse(payload);
  if (!parsed.success) throw new Error("The publication response has an invalid shape.");
  return parsed.data.data;
}

async function readBoard16ApiResponse(brandId: string): Promise<Board16Data | null> {
  const taskPage = await readData<TaskPage>(
    `/api/brands/${encodeURIComponent(brandId)}/work/tasks?taskType=improve_page_for_buyer_need&limit=1`,
    taskPageEnvelope,
  );
  const taskSummary = taskPage.items[0];
  if (!taskSummary) return null;

  const task = await readData<Board16ApiTask>(
    `/api/brands/${encodeURIComponent(brandId)}/work/tasks/${encodeURIComponent(taskSummary.id)}`,
    taskDetailEnvelope,
  );
  const [articles, pages] = await Promise.all([
    readData<z.infer<typeof articleSchema>[]>(
      `/api/articles?brandId=${encodeURIComponent(brandId)}&status=ready&limit=100`,
      articlesEnvelope,
    ),
    readData<z.infer<typeof siteHealthPagesSchema>>(
      `/api/dashboard/site-health/${encodeURIComponent(brandId)}/pages`,
      siteHealthEnvelope,
    ),
  ]);
  const pageUrl = readContentChange(task)?.pageUrl;
  const article = articles.find((candidate) => candidate.externalUrl === pageUrl);
  const revisions = article
    ? await readData<z.infer<typeof revisionSchema>[]>(
        `/api/articles/${encodeURIComponent(article.id)}/revisions?limit=50`,
        revisionsEnvelope,
      )
    : [];

  return mapBoard16ApiResponse({ task, articles, revisions, pages });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The publication check could not load.";
}

function staleAsOf(data: Board16Data): string {
  const fetchedAt = data.publication.fetchedAt;
  switch (fetchedAt.kind) {
    case "measured":
      return fetchedAt.value;
    case "stale":
      return fetchedAt.asOf;
    case "not-measured":
    case "failed":
      return "unknown";
    default: {
      const exhaustive: never = fetchedAt;
      return exhaustive;
    }
  }
}

export function useBoard16Data(): V2LiveResult<Board16Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const query = useQuery<Board16Data | null>({
    queryKey: ["v2", "my-work", "publication-check", selectedBrandId],
    enabled: Boolean(selectedBrandId),
    meta: { suppressErrorToast: true },
    queryFn: () => readBoard16ApiResponse(selectedBrandId),
    staleTime: 30_000,
  });

  if (brandsLoading || (selectedBrandId && query.isPending)) {
    return { state: { kind: "loading" } };
  }
  if (!selectedBrandId) {
    return { state: { kind: "empty", reason: "Select a brand to view publication work." } };
  }
  if (query.isError) {
    return { state: { kind: "error", message: errorMessage(query.error) } };
  }
  if (query.data === null) {
    return { state: { kind: "empty", reason: "No publication task exists for this brand." } };
  }
  if (!query.data) {
    return { state: { kind: "loading" } };
  }
  if (query.isStale) {
    return {
      state: {
        kind: "stale",
        reason: "The publication check may be out of date.",
        asOf: staleAsOf(query.data),
      },
      data: query.data,
    };
  }
  return { state: { kind: "ready" }, data: query.data };
}
