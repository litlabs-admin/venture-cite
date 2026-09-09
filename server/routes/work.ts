import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { requireBrand, requireUser } from "../lib/ownership";
import { asyncHandler, sendError } from "../lib/routesShared";
import { createRequestActor } from "../lib/requestActor";
import {
  createWorkRepository,
  type WorkOutcomeReviewResult,
  type WorkVerificationResult,
} from "../domains/work/repository";
import { LEVELS, levelForProgress } from "../domains/work/policy";
import {
  createWorkService,
  isWorkCursor,
  type WorkHistoryEvent,
  type WorkService,
} from "../services/work/WorkService";
import type { WorkAwardView, WorkTaskDetailsView, WorkTaskView } from "../storage/workStorage";
import { WorkServiceError } from "../services/work/workServiceErrors";
import { TASK_TYPES, type TaskState, type TaskType, type VerificationMethod } from "@shared/work";

const httpUrl = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value));
const nonEmpty = z.string().trim().min(1);
const strictObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

const evidenceReferenceSchema = z.discriminatedUnion("kind", [
  strictObject({
    kind: z.literal("source"),
    label: nonEmpty,
    sourceUrl: httpUrl,
    factId: nonEmpty.optional(),
    scrapePageId: nonEmpty.optional(),
    checkId: nonEmpty.optional(),
    finalUrl: httpUrl.optional(),
    canonicalUrl: httpUrl.optional(),
    retrievedAt: z.string().datetime(),
    excerpt: nonEmpty,
  }),
  strictObject({
    kind: z.literal("artifact"),
    label: nonEmpty,
    artifactId: nonEmpty,
    version: z.number().int().positive(),
    reviewedByUserId: nonEmpty,
    coverage: nonEmpty,
    duplicateCheck: nonEmpty,
  }),
  strictObject({
    kind: z.literal("measurement"),
    label: nonEmpty,
    measurementId: nonEmpty,
    geoRankingId: nonEmpty.optional(),
    citationRunId: nonEmpty.optional(),
    brandPromptId: nonEmpty.optional(),
    promptGenerationId: nonEmpty.optional(),
    scopeId: nonEmpty,
    provider: nonEmpty,
    promptVersion: nonEmpty,
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    coverage: nonEmpty,
  }),
  strictObject({
    kind: z.literal("fault_repair"),
    label: nonEmpty,
    faultId: nonEmpty,
    beforeCheckId: nonEmpty,
    afterCheckId: nonEmpty,
    checkedAt: z.string().datetime(),
  }),
  strictObject({
    kind: z.literal("content_change"),
    label: nonEmpty,
    changeId: nonEmpty,
    pageUrl: httpUrl,
    buyerNeed: nonEmpty,
    publishedAt: z.string().datetime(),
  }),
  strictObject({
    kind: z.literal("authored_work"),
    label: nonEmpty,
    submissionId: nonEmpty,
    destinationUrl: httpUrl,
    authoredByUserId: nonEmpty,
    submittedAt: z.string().datetime(),
  }),
  strictObject({
    kind: z.literal("confirmation"),
    label: nonEmpty,
    confirmedByUserId: nonEmpty,
    note: nonEmpty,
    confirmedAt: z.string().datetime(),
  }),
  strictObject({
    kind: z.literal("decision"),
    label: nonEmpty,
    decisionId: nonEmpty,
    reviewPeriod: nonEmpty,
    decision: nonEmpty,
    basedOnMeasurementId: nonEmpty,
  }),
  strictObject({
    kind: z.literal("experiment"),
    label: nonEmpty,
    experimentId: nonEmpty,
    hypothesis: nonEmpty,
    baselineMeasurementId: nonEmpty,
    changedAt: z.string().datetime(),
    laterMeasurementId: nonEmpty,
    conclusion: nonEmpty,
  }),
]);

const commandSchema = z.discriminatedUnion("kind", [
  strictObject({ kind: z.literal("accept") }),
  strictObject({ kind: z.literal("start") }),
  strictObject({ kind: z.literal("submit"), evidence: z.array(evidenceReferenceSchema).min(1) }),
  strictObject({ kind: z.literal("dismiss"), reason: nonEmpty }),
  strictObject({ kind: z.literal("mark_not_applicable"), reason: nonEmpty }),
  strictObject({ kind: z.literal("reopen"), reason: nonEmpty }),
]);

const commandRequestSchema = strictObject({
  expectedRevision: z.number().int().nonnegative(),
  command: commandSchema,
});

type WorkDetailsProjection = WorkTaskDetailsView & { awards?: WorkAwardView[] };

const verificationSchema: z.ZodType<VerificationMethod> = z.discriminatedUnion("kind", [
  strictObject({ kind: z.literal("system_check"), checkId: nonEmpty }),
  strictObject({
    kind: z.literal("human_confirmation"),
    confirmedByUserId: nonEmpty,
    note: nonEmpty,
  }),
]);

const measurementScopeSchema = z.discriminatedUnion("kind", [
  strictObject({ kind: z.literal("period"), period: nonEmpty }),
  strictObject({ kind: z.literal("provider"), provider: nonEmpty, period: nonEmpty }),
  strictObject({ kind: z.literal("prompt_set"), promptSetId: nonEmpty, period: nonEmpty }),
]);

const verifyRequestSchema = strictObject({
  expectedRevision: z.number().int().nonnegative(),
  cycleKey: nonEmpty,
  verification: verificationSchema,
  evidence: z.array(evidenceReferenceSchema).min(1),
});

const reviewRequestSchema = strictObject({
  expectedRevision: z.number().int().nonnegative(),
  cycleKey: nonEmpty,
  measurementScope: measurementScopeSchema,
  decision: z.enum(["improvement", "decline", "no_material_change", "unavailable"]),
  notes: z.string().nullable().optional(),
  visibilityEvidenceVersion: z.number().int().positive().nullable().optional(),
  businessResultEventId: nonEmpty.nullable().optional(),
  nextCheckAt: z.string().datetime().nullable().optional(),
});

const taskStates = [
  "suggested",
  "accepted",
  "in_progress",
  "submitted",
  "verified",
  "waiting_for_observation",
  "dismissed",
  "not_applicable",
  "reopened",
] as const;
const workStatuses: [
  TaskState | "assigned" | "reversed",
  ...(TaskState | "assigned" | "reversed")[],
] = [...taskStates, "assigned", "reversed"];
const taskTypes: [TaskType, ...TaskType[]] = [...TASK_TYPES];

const listQuerySchema = z
  .object({
    status: z.enum(workStatuses).optional(),
    taskType: z.enum(taskTypes).optional(),
    date: z.string().date().optional(),
    task: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().trim().min(1).refine(isWorkCursor, "The work cursor is invalid").optional(),
  })
  .strict();

const todayQuerySchema = z
  .object({ mode: z.enum(["guided", "expert"]).default("guided") })
  .strict();

type WorkContext = { service: WorkService };

function context(req: Request): WorkContext {
  const user = requireUser(req);
  const actor = createRequestActor(user.id);
  const repository = createWorkRepository({ actor, database: db });
  const service = createWorkService({
    actor,
    repository,
    brandReader: {
      async findActiveBrand(currentActor, brandId) {
        const brand = await storage.getBrandByIdForUser(brandId, currentActor.userId);
        return brand ? { id: brand.id } : undefined;
      },
    },
  });
  return { service };
}

export function setupWorkRoutes(app: Express): void {
  app.get(
    "/api/brands/:brandId/work/summary",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const query = todayQuerySchema.safeParse(req.query);
      if (!query.success) return invalidRequest(res, query.error);
      const brandId = await ownedBrand(req);
      if (!brandId) return;
      try {
        const result = await context(req).service.getToday({ brandId, mode: query.data.mode });
        if (isNotFound(result)) return res.status(404).json({ success: false, error: "not_found" });
        const summary = result.summary;
        const points = summary?.awards.points ?? 0;
        const milestoneList = summary?.capabilityState.map((m) => m.milestone) ?? [];
        const current = levelForProgress({ points, milestones: new Set(milestoneList) });
        const next = LEVELS.find((level) => level.level === current.level + 1) ?? null;
        const projectedTasks = result.tasks.map((task) => projectTask(task));
        return res.json({
          success: true,
          data: {
            brandId,
            points,
            pendingCount: summary?.taskCounts.pending ?? 0,
            milestones: milestoneList,
            currentLevel: { level: current.level, name: current.name, points: current.points },
            nextThreshold: next
              ? { level: next.level, name: next.name, points: next.points }
              : null,
            goal: result.goal ?? null,
            nextTask: projectedTasks[0] ?? null,
            waitingTasks: projectedTasks.filter((task) => task.state === "waiting_for_observation"),
            mode: result.mode,
          },
        });
      } catch (error) {
        return respondError(res, error, "Unable to load work summary");
      }
    }),
  );

  app.get(
    "/api/brands/:brandId/work/tasks",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const query = listQuerySchema.safeParse(req.query);
      if (!query.success) return invalidRequest(res, query.error);
      const brandId = await ownedBrand(req);
      if (!brandId) return;
      try {
        const result = await context(req).service.getTaskPage({
          brandId,
          filters: {
            status: query.data.status,
            taskType: query.data.taskType,
            date: query.data.date,
            taskId: query.data.task,
            cursor: query.data.cursor,
            limit: query.data.limit,
          },
        });
        if (isNotFound(result)) return res.status(404).json({ success: false, error: "not_found" });
        return res.json({
          success: true,
          data: {
            items: result.items.map((task) => projectTask(task)),
            nextCursor: result.nextCursor,
          },
        });
      } catch (error) {
        return respondError(res, error, "Unable to load work tasks");
      }
    }),
  );

  app.post(
    "/api/brands/:brandId/work/reconcile",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const brandId = await ownedBrand(req);
      if (!brandId) return;
      try {
        const { reconcileBrandWorkOpportunities } =
          await import("../services/work/productionOpportunities");
        const links = await reconcileBrandWorkOpportunities({
          actor: createRequestActor(requireUser(req).id),
          brandId,
        });
        return res.json({
          success: true,
          data: { links: links ?? [], count: links?.length ?? 0 },
        });
      } catch (error) {
        return respondError(res, error, "Unable to reconcile work opportunities");
      }
    }),
  );

  app.get(
    "/api/brands/:brandId/work/tasks/:taskId",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const brandId = await ownedBrand(req);
      if (!brandId) return;
      try {
        const result = await context(req).service.getTask({ brandId, taskId: req.params.taskId });
        if (isNotFound(result)) return res.status(404).json({ success: false, error: "not_found" });
        return res.json({ success: true, data: projectTask(result.task, result.details) });
      } catch (error) {
        return respondError(res, error, "Unable to load work task");
      }
    }),
  );

  app.post(
    "/api/brands/:brandId/work/tasks/:taskId/commands",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const parsed = commandRequestSchema.safeParse(req.body);
      if (!parsed.success) return invalidRequest(res, parsed.error);
      const brandId = await ownedBrand(req);
      if (!brandId) return;
      try {
        const result = await context(req).service.transitionTask({
          brandId,
          taskId: req.params.taskId,
          expectedRevision: parsed.data.expectedRevision,
          command: parsed.data.command,
        });
        return respondTaskResult(res, result);
      } catch (error) {
        return respondError(res, error, "Unable to update work task");
      }
    }),
  );

  app.post(
    "/api/brands/:brandId/work/tasks/:taskId/verify",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const parsed = verifyRequestSchema.safeParse(req.body);
      if (!parsed.success) return invalidRequest(res, parsed.error);
      const brandId = await ownedBrand(req);
      if (!brandId) return;
      try {
        const result = await context(req).service.verifyTask({
          brandId,
          taskId: req.params.taskId,
          expectedRevision: parsed.data.expectedRevision,
          cycleKey: parsed.data.cycleKey,
          verification: parsed.data.verification,
          evidence: parsed.data.evidence,
        });
        return respondVerificationResult(res, result);
      } catch (error) {
        return respondError(res, error, "Unable to verify work task");
      }
    }),
  );

  app.post(
    "/api/brands/:brandId/work/tasks/:taskId/review",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const parsed = reviewRequestSchema.safeParse(req.body);
      if (!parsed.success) return invalidRequest(res, parsed.error);
      const brandId = await ownedBrand(req);
      if (!brandId) return;
      try {
        const result = await context(req).service.reviewTask({
          brandId,
          taskId: req.params.taskId,
          ...parsed.data,
        });
        return respondReviewResult(res, result);
      } catch (error) {
        return respondError(res, error, "Unable to record work outcome");
      }
    }),
  );

  app.get(
    "/api/brands/:brandId/work/history",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const query = listQuerySchema.safeParse(req.query);
      if (!query.success) return invalidRequest(res, query.error);
      const brandId = await ownedBrand(req);
      if (!brandId) return;
      try {
        const result = await context(req).service.getHistory({
          brandId,
          filters: {
            status: query.data.status,
            taskType: query.data.taskType,
            date: query.data.date,
            taskId: query.data.task,
            cursor: query.data.cursor,
            limit: query.data.limit,
          },
        });
        if (isNotFound(result)) return res.status(404).json({ success: false, error: "not_found" });
        return res.json({
          success: true,
          data: { items: result.items.map(projectHistoryEvent), nextCursor: result.nextCursor },
        });
      } catch (error) {
        return respondError(res, error, "Unable to load work history");
      }
    }),
  );

  app.get(
    "/api/brands/:brandId/work/export",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const brandId = await ownedBrand(req);
      if (!brandId) return;
      try {
        const exported = await context(req).service.exportWork({ brandId });
        if (isNotFound(exported))
          return res.status(404).json({ success: false, error: "not_found" });
        return res.json({
          success: true,
          data: {
            manifestVersion: exported.manifestVersion,
            brandId: exported.brandId,
            exportedAt: exported.exportedAt.toISOString(),
            tasks: exported.tasks.map((entry) => ({
              task: projectTask(entry.task),
              details: projectDetails(entry.details, entry.task),
            })),
          },
        });
      } catch (error) {
        return respondError(res, error, "Unable to export work data");
      }
    }),
  );
}

function projectTask(task: WorkTaskView, details?: WorkTaskDetailsView) {
  const projected = {
    id: task.id,
    brandId: task.brandId,
    goalId: task.goalId,
    taskKey: task.taskKey,
    taskVersion: task.taskVersion,
    type: task.taskType,
    state: task.state,
    revision: task.revision,
    title: task.title,
    desiredResult: task.desiredResult,
    buyerNeed: task.buyerNeed,
    recommendedChange: task.recommendedChange,
    reason: task.reason,
    confidence: task.confidence,
    effort: task.effort,
    points: task.points,
    completionRule: task.completionRule,
    measurementScope: task.measurementScope,
    nextCheckAt: iso(task.nextCheckAt),
    ownerId: task.owner?.id ?? null,
    ownerName: task.owner
      ? [task.owner.firstName, task.owner.lastName].filter(Boolean).join(" ") || null
      : null,
    createdAt: iso(task.createdAt),
    updatedAt: iso(task.updatedAt),
    ...(details
      ? {
          evidence: details.evidence.map((item) => ({
            ...item,
            retrievedAt: iso(item.retrievedAt),
            observedAt: iso(item.observedAt),
            createdAt: iso(item.createdAt),
          })),
          history: projectDetails(details, task).history,
        }
      : {}),
  };
  return projected;
}

function projectHistoryEvent(event: WorkHistoryEvent) {
  return {
    id: event.id,
    taskId: event.taskId,
    brandId: event.brandId,
    taskVersion: event.taskVersion,
    taskTitle: event.taskTitle,
    taskType: event.taskType,
    revision: event.revision,
    priorState: event.priorState,
    state: event.state,
    actorId: event.actorId,
    actorKind: event.actorKind,
    reason: event.reason,
    verificationMethod: event.verificationMethod,
    occurredAt: iso(event.occurredAt),
    ...(event.award
      ? {
          award: {
            ...event.award,
            awardedAt: iso(event.award.awardedAt),
          },
        }
      : {}),
  };
}

function projectDetails(details: WorkDetailsProjection, task: WorkTaskView) {
  return {
    evidence: details.evidence.map((item) => ({
      ...item,
      retrievedAt: iso(item.retrievedAt),
      observedAt: iso(item.observedAt),
      createdAt: iso(item.createdAt),
    })),
    history: details.history.flatMap((event) => {
      if (!isTaskStateValue(event.nextState)) return [];
      return [
        projectHistoryEvent({
          id: event.id,
          taskId: event.taskId,
          brandId: event.brandId,
          taskVersion: event.taskVersion,
          taskTitle: task.title,
          taskType: task.taskType,
          revision: event.revision,
          state: event.nextState,
          priorState: event.priorState,
          actorId: event.actorId,
          actorKind: event.actorKind,
          reason: event.reason,
          verificationMethod: event.verificationMethod,
          occurredAt: event.createdAt,
        }),
      ];
    }),
    awards: projectAwards(details.awards ?? []),
    reversals: projectAwards(
      details.awards?.filter((award) => award.awardStatus === "reversed") ?? [],
    ),
  };
}

function projectAwards(awards: WorkAwardView[]) {
  return awards.map((award) => ({
    ...award,
    occurredAt: iso(award.occurredAt),
  }));
}

function isTaskStateValue(value: string): value is TaskState {
  return (taskStates as readonly string[]).includes(value);
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

async function ownedBrand(req: Request): Promise<string | undefined> {
  const user = requireUser(req);
  try {
    const brand = await requireBrand(req.params.brandId, user.id);
    return brand.id;
  } catch (error) {
    respondError(req.res!, error, "Brand not found");
    return undefined;
  }
}

function respondTaskResult(res: Response, value: WorkTaskView | { kind: "not_found" }): Response {
  if (isNotFound(value)) return res.status(404).json({ success: false, error: "not_found" });
  return res.json({ success: true, data: projectTask(value) });
}

function respondVerificationResult(
  res: Response,
  value: WorkVerificationResult | { kind: "not_found" },
): Response {
  if (isNotFound(value)) return res.status(404).json({ success: false, error: "not_found" });
  return res.json({
    success: true,
    data: {
      task: projectTask(value.task),
      award: { ...value.award, occurredAt: iso(value.award.occurredAt) },
      created: value.created,
    },
  });
}

function respondReviewResult(
  res: Response,
  value: WorkOutcomeReviewResult | { kind: "not_found" },
): Response {
  if (isNotFound(value)) return res.status(404).json({ success: false, error: "not_found" });
  return res.json({
    success: true,
    data: {
      task: projectTask(value.task),
      review: {
        ...value.review,
        nextCheckAt: iso(value.review.nextCheckAt),
        createdAt: iso(value.review.createdAt),
        updatedAt: iso(value.review.updatedAt),
      },
      pointsChanged: 0,
    },
  });
}

function isNotFound(value: unknown): value is { kind: "not_found" } {
  return (
    typeof value === "object" && value !== null && "kind" in value && value.kind === "not_found"
  );
}

function invalidRequest(res: Response, error: z.ZodError): Response {
  return res.status(400).json({ success: false, error: "invalid_request", details: error.issues });
}

function respondError(res: Response, error: unknown, fallback: string): Response {
  if (error instanceof WorkServiceError) {
    if (error.code === "revision_conflict") {
      return res
        .status(409)
        .json({ success: false, error: error.code, currentRevision: error.currentRevision });
    }
    if (error.code === "configuration_error") {
      return res.status(503).json({ success: false, error: error.code });
    }
    return res.status(422).json({ success: false, error: error.code });
  }
  sendError(res, error, fallback);
  return res;
}
