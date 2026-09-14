// Board 40 (earned media opportunities) and board 41 (content opportunity
// inventory), both under /v2/my-work. There is no dedicated opportunity
// table for either board (see docs/superpowers/analysis/2026-09-14-screens/
// 02-backend-coverage.md row 122-123) so every list is derived, on read,
// from tables that already exist: listicles, community_posts,
// brand_mentions and geo_rankings for board 40; bofu_content, faq_items,
// articles and tracked_content_urls for board 41. `opportunityBoards.ts`
// holds the pure derivation; this file only fetches rows and turns
// opportunities into real work_tasks rows on action.
//
// Task keys use a "v2earned:"/"v2content:" namespace distinct from the
// "earned:"/"content:" namespace the existing opportunity reconciler
// (server/services/work/productionOpportunities.ts) owns. Sharing that
// namespace would make a later `/work/reconcile` call dismiss these tasks
// as "no longer reported" the moment its own narrower sources (unpublished
// BOFU pages, new-status listicles) stopped matching them.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { requireBrand, requireUser } from "../lib/ownership";
import { asyncHandler, sendError } from "../lib/routesShared";
import { createRequestActor } from "../lib/requestActor";
import { createWorkRepository } from "../domains/work/repository";
import type { TaskState } from "@shared/work";
import {
  deriveEarnedMediaBoard,
  deriveContentOpportunityBoard,
  type ArticleRecord,
  type BofuContentRecord,
  type BrandMentionRecord,
  type BrandPromptRecord,
  type CommunityPostRecord,
  type ContentPage,
  type EarnedMediaOpportunity,
  type FaqItemRecord,
  type GeoRankingRecord,
  type ListicleRecord,
  type TrackedContentUrlRecord,
} from "../services/work/opportunityBoards";

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}
function isoRequired(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

async function ownedBrand(
  req: Request,
): Promise<{ id: string; website: string | null } | undefined> {
  const user = requireUser(req);
  try {
    const brand = await requireBrand(req.params.brandId, user.id);
    return { id: brand.id, website: brand.website };
  } catch (error) {
    respondError(req.res!, error, "Brand not found");
    return undefined;
  }
}

function respondError(res: Response, error: unknown, fallback: string): Response {
  sendError(res, error, fallback);
  return res;
}

async function taskStateByKey(
  actor: ReturnType<typeof createRequestActor>,
  brandId: string,
): Promise<Map<string, TaskState>> {
  const repository = createWorkRepository({ actor, database: db });
  const tasks = await repository.listTasks(brandId);
  const map = new Map<string, TaskState>();
  for (const task of tasks ?? []) map.set(task.taskKey, task.state);
  return map;
}

async function loadEarnedMediaBoard(
  brandId: string,
  ownDomain: string | null,
  actorUserId: string,
) {
  const actor = createRequestActor(actorUserId);
  const [listicles, communityPosts, brandMentions, brandPrompts, taskStates] = await Promise.all([
    storage.getListicles(brandId),
    storage.getCommunityPosts(brandId),
    storage.getBrandMentions(brandId),
    storage.getBrandPromptsByBrandId(brandId),
    taskStateByKey(actor, brandId),
  ]);
  const geoRankings = await storage.getGeoRankingsByBrandPromptIds(brandPrompts.map((p) => p.id));

  const listicleRecords: ListicleRecord[] = listicles.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    sourcePublication: row.sourcePublication,
    isIncluded: row.isIncluded,
    listPosition: row.listPosition,
    totalListItems: row.totalListItems,
    domainAuthority: row.domainAuthority,
    searchVolume: row.searchVolume,
    outreachStatus: row.outreachStatus,
    lastChecked: isoRequired(row.lastChecked),
  }));
  const communityRecords: CommunityPostRecord[] = communityPosts.map((row) => ({
    id: row.id,
    platform: row.platform,
    groupName: row.groupName,
    groupUrl: row.groupUrl,
    content: row.content,
    status: row.status,
    keywords: row.keywords,
    createdAt: isoRequired(row.createdAt),
  }));
  const mentionRecords: BrandMentionRecord[] = brandMentions.map((row) => ({
    id: row.id,
    platform: row.platform,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    mentionContext: row.mentionContext,
    sentiment: row.sentiment,
    isVerified: row.isVerified,
    status: row.status,
    mentionedAt: iso(row.mentionedAt),
    discoveredAt: isoRequired(row.discoveredAt),
  }));
  const promptRecords: BrandPromptRecord[] = brandPrompts.map((row) => ({
    id: row.id,
    prompt: row.prompt,
  }));
  const geoRecords: GeoRankingRecord[] = geoRankings.map((row) => ({
    id: row.id,
    brandPromptId: row.brandPromptId,
    aiPlatform: row.aiPlatform,
    prompt: row.prompt,
    isCited: row.isCited,
    citedUrls: row.citedUrls,
    citationContext: row.citationContext,
    checkedAt: isoRequired(row.checkedAt),
  }));

  return deriveEarnedMediaBoard({
    ownDomain: hostnameOf(ownDomain),
    listicles: listicleRecords,
    communityPosts: communityRecords,
    brandMentions: mentionRecords,
    geoRankings: geoRecords,
    brandPrompts: promptRecords,
    taskStateByTaskKey: taskStates,
  });
}

async function loadContentBoard(brandId: string) {
  const [bofuContent, faqItems, articles, trackedContentUrls, brandPrompts] = await Promise.all([
    storage.getBofuContent(brandId),
    storage.getFaqItems(brandId),
    storage.getRecentArticlesByBrandId(brandId, 200),
    storage.getTrackedContentUrlsByBrandId(brandId),
    storage.getBrandPromptsByBrandId(brandId),
  ]);
  const geoRankings = await storage.getGeoRankingsByBrandPromptIds(brandPrompts.map((p) => p.id));

  const bofuRecords: BofuContentRecord[] = bofuContent.map((row) => ({
    id: row.id,
    contentType: row.contentType,
    title: row.title,
    content: row.content,
    primaryKeyword: row.primaryKeyword,
    targetIntent: row.targetIntent,
    status: row.status,
    aiScore: row.aiScore,
    publishedUrl: row.publishedUrl,
    updatedAt: isoRequired(row.updatedAt),
  }));
  const faqRecords: FaqItemRecord[] = faqItems.map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    category: row.category,
    aiSurfaceScore: row.aiSurfaceScore,
    publishedUrl: row.publishedUrl,
    updatedAt: isoRequired(row.updatedAt),
  }));
  const articleRecords: ArticleRecord[] = articles.map((row) => ({
    id: row.id,
    title: row.title,
    contentType: row.contentType,
    keywords: row.keywords,
    citationCount: row.citationCount,
    externalUrl: row.externalUrl,
    updatedAt: isoRequired(row.updatedAt),
  }));
  const trackedRecords: TrackedContentUrlRecord[] = trackedContentUrls.map((row) => ({
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    normalizedUrl: row.normalizedUrl,
  }));
  const promptRecords: BrandPromptRecord[] = brandPrompts.map((row) => ({
    id: row.id,
    prompt: row.prompt,
  }));
  const geoRecords: GeoRankingRecord[] = geoRankings.map((row) => ({
    id: row.id,
    brandPromptId: row.brandPromptId,
    aiPlatform: row.aiPlatform,
    prompt: row.prompt,
    isCited: row.isCited,
    citedUrls: row.citedUrls,
    citationContext: row.citationContext,
    checkedAt: isoRequired(row.checkedAt),
  }));

  return deriveContentOpportunityBoard({
    bofuContent: bofuRecords,
    faqItems: faqRecords,
    articles: articleRecords,
    trackedContentUrls: trackedRecords,
    brandPrompts: promptRecords,
    geoRankings: geoRecords,
  });
}

const EARNED_MEDIA_COMPLETION_RULE = { required: ["authored_work", "confirmation"] as const };
const PAGE_IMPROVEMENT_COMPLETION_RULE = { required: ["content_change", "confirmation"] as const };

function parseSourceId(prefix: string, opportunityId: string): string | undefined {
  if (!opportunityId.startsWith(`${prefix}:`)) return undefined;
  return opportunityId.slice(prefix.length + 1);
}

async function createEarnedMediaTask(
  req: Request,
  res: Response,
  brandId: string,
  opportunity: EarnedMediaOpportunity,
) {
  const user = requireUser(req);
  const actor = createRequestActor(user.id);
  const repository = createWorkRepository({ actor, database: db });
  const sourceId =
    parseSourceId("listicle", opportunity.id) ??
    parseSourceId("community", opportunity.id) ??
    parseSourceId("mention", opportunity.id) ??
    parseSourceId("citation", opportunity.id) ??
    opportunity.id;
  const result = await repository.createTaskWithTriggerEvidence(
    brandId,
    {
      taskKey: opportunity.taskKey,
      taskVersion: 1,
      taskType: "complete_earned_media_or_community_work",
      title: "Complete the earned media outreach",
      desiredResult: "Complete the earned media outreach",
      recommendedChange: opportunity.detail.headline,
      reason: opportunity.detail.headline,
      completionRule: EARNED_MEDIA_COMPLETION_RULE,
      ruleVersion: 1,
    },
    [
      {
        kind: "artifact",
        label: opportunity.detail.headline,
        artifactId: `${opportunity.sourceType}:${sourceId}`,
        version: 1,
        coverage: `${opportunity.affectedQuestionCount} buyer question(s)`,
        duplicateCheck: sourceId,
      },
    ],
  );
  if (result === undefined) return res.status(404).json({ success: false, error: "not_found" });
  return res.json({ success: true, data: { taskId: result.task.id, created: result.created } });
}

async function createContentTask(req: Request, res: Response, brandId: string, page: ContentPage) {
  const user = requireUser(req);
  const actor = createRequestActor(user.id);
  const repository = createWorkRepository({ actor, database: db });
  const sourceId =
    parseSourceId("bofu", page.id) ??
    parseSourceId("faq", page.id) ??
    parseSourceId("article", page.id) ??
    page.id;
  const result = await repository.createTaskWithTriggerEvidence(
    brandId,
    {
      taskKey: page.taskKey,
      taskVersion: 1,
      taskType: "improve_page_for_buyer_need",
      title: "Improve the page for a buyer need",
      desiredResult: "Improve the page for a buyer need",
      recommendedChange: page.recommendedChange,
      reason: `The page "${page.title}" at ${page.path} needs: ${page.recommendedChange}`,
      completionRule: PAGE_IMPROVEMENT_COMPLETION_RULE,
      ruleVersion: 1,
    },
    [
      {
        kind: "artifact",
        label: `Existing ${page.type} page with a documented visibility or evidence gap.`,
        artifactId: `${page.sourceType}:${sourceId}`,
        version: 1,
        coverage: page.recommendedChange,
        duplicateCheck: sourceId,
      },
    ],
  );
  if (result === undefined) return res.status(404).json({ success: false, error: "not_found" });
  return res.json({ success: true, data: { taskId: result.task.id, created: result.created } });
}

const taskRequestSchema = z.object({ opportunityId: z.string().trim().min(1) }).strict();

const statusRequestSchema = z
  .object({
    opportunityId: z.string().trim().min(1),
    status: z.enum(["Not started", "In progress", "Completed", "Not a fit"]),
  })
  .strict();

export function setupV2OpportunityRoutes(app: Express): void {
  app.get(
    "/api/v2/opportunities/earned-media/:brandId",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const brand = await ownedBrand(req);
      if (!brand) return;
      try {
        const board = await loadEarnedMediaBoard(brand.id, brand.website, requireUser(req).id);
        return res.json({ success: true, data: board });
      } catch (error) {
        return respondError(res, error, "Unable to load earned media opportunities");
      }
    }),
  );

  app.post(
    "/api/v2/opportunities/earned-media/:brandId/tasks",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const parsed = taskRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "invalid_request" });
      }
      const brand = await ownedBrand(req);
      if (!brand) return;
      try {
        const board = await loadEarnedMediaBoard(brand.id, brand.website, requireUser(req).id);
        const opportunity = board.opportunities.find(
          (item) => item.id === parsed.data.opportunityId,
        );
        if (!opportunity) return res.status(404).json({ success: false, error: "not_found" });
        return await createEarnedMediaTask(req, res, brand.id, opportunity);
      } catch (error) {
        return respondError(res, error, "Unable to create the outreach task");
      }
    }),
  );

  app.patch(
    "/api/v2/opportunities/earned-media/:brandId/status",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const parsed = statusRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "invalid_request" });
      }
      const brand = await ownedBrand(req);
      if (!brand) return;
      const { opportunityId, status } = parsed.data;
      try {
        const listicleId = parseSourceId("listicle", opportunityId);
        if (listicleId) {
          const existing = await storage.getListicleById(listicleId);
          if (!existing || existing.brandId !== brand.id) {
            return res.status(404).json({ success: false, error: "not_found" });
          }
          const outreachStatus =
            status === "Not started"
              ? "new"
              : status === "In progress"
                ? "contacted"
                : status === "Completed"
                  ? "won"
                  : "dropped";
          await storage.updateListicle(listicleId, { outreachStatus });
          return res.json({ success: true, data: { status } });
        }
        const mentionId = parseSourceId("mention", opportunityId);
        if (mentionId) {
          const existing = await storage.getBrandMentionById(mentionId);
          if (!existing || existing.brandId !== brand.id) {
            return res.status(404).json({ success: false, error: "not_found" });
          }
          const mentionStatus =
            status === "Not started"
              ? "new"
              : status === "In progress"
                ? "acknowledged"
                : status === "Completed"
                  ? "replied"
                  : "ignored";
          await storage.updateBrandMentionStatus(mentionId, mentionStatus);
          return res.json({ success: true, data: { status } });
        }
        return res.status(422).json({ success: false, error: "status_not_editable" });
      } catch (error) {
        return respondError(res, error, "Unable to update the opportunity status");
      }
    }),
  );

  app.get(
    "/api/v2/opportunities/content/:brandId",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const brand = await ownedBrand(req);
      if (!brand) return;
      try {
        const board = await loadContentBoard(brand.id);
        return res.json({ success: true, data: board });
      } catch (error) {
        return respondError(res, error, "Unable to load content opportunities");
      }
    }),
  );

  app.post(
    "/api/v2/opportunities/content/:brandId/tasks",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const parsed = taskRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "invalid_request" });
      }
      const brand = await ownedBrand(req);
      if (!brand) return;
      try {
        const board = await loadContentBoard(brand.id);
        const page = board.pages.find((item) => item.id === parsed.data.opportunityId);
        if (!page) return res.status(404).json({ success: false, error: "not_found" });
        return await createContentTask(req, res, brand.id, page);
      } catch (error) {
        return respondError(res, error, "Unable to create the improvement task");
      }
    }),
  );
}
