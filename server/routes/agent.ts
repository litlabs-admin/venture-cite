// Agent tasks, outreach, automation, publication targets, outreach emails (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split.
// The original monolith now only mounts this module via setupAgentRoutes.
//
// Includes:
//   /api/agent-tasks              — task queue CRUD + execute endpoints
//   /api/outreach-campaigns       — campaign CRUD + stats
//   /api/automation-rules         — rules CRUD
//   /api/automation-executions    — executions CRUD (scoped via rule/brand ownership)
//   /api/publication-targets      — target CRUD + discovery + contact finding
//   /api/outreach-emails          — email CRUD + send + stats

import type { Express } from "express";
import { storage } from "../storage";
import {
  requireUser,
  requireBrand,
  requireArticle,
  requireAgentTask,
  requireOutreachCampaign,
  requireAutomationRule,
  requirePublicationTarget,
  requireOutreachEmail,
  getUserBrandIds,
  pickFields,
} from "../lib/ownership";
import { aiLimitMiddleware, sendError } from "../lib/routesShared";
import { InvalidStateTransitionError } from "../lib/statusTransitions";

export function setupAgentRoutes(app: Express): void {
  const AGENT_TASK_WRITE_FIELDS = [
    "brandId",
    "taskType",
    "taskTitle",
    "taskDescription",
    "priority",
    "status",
    "assignedTo",
    "triggeredBy",
    "automationRuleId",
    "inputData",
    "outputData",
    "aiModelUsed",
    "tokensUsed",
    "estimatedCredits",
    "actualCredits",
    "scheduledFor",
    "startedAt",
    "completedAt",
    "error",
    "retryCount",
    "maxRetries",
    "metadata",
  ] as const;

  // Agent Task Queue routes — all scoped to caller's brands.
  app.get("/api/agent-tasks", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, status, taskType, priority } = req.query;
      const filters: { status?: string; taskType?: string; priority?: string } = {};
      if (status) filters.status = status as string;
      if (taskType) filters.taskType = taskType as string;
      if (priority) filters.priority = priority as string;
      if (brandId && typeof brandId === "string") {
        const tasks = await storage.getAgentTasks(brandId, filters);
        return res.json({ success: true, data: tasks });
      }
      const brandIds = await getUserBrandIds(user.id);
      const all = await storage.getAgentTasks(undefined, filters);
      const tasks = all.filter((t: any) => t.brandId && brandIds.has(t.brandId));
      res.json({ success: true, data: tasks });
    } catch (error) {
      sendError(res, error, "Failed to fetch agent tasks");
    }
  });

  app.post("/api/agent-tasks", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, AGENT_TASK_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (!body.taskType || !body.taskTitle || !body.triggeredBy) {
        return res
          .status(400)
          .json({ success: false, error: "taskType, taskTitle, and triggeredBy are required" });
      }
      const task = await storage.createAgentTask(body as any);
      res.json({ success: true, data: task });
    } catch (error) {
      sendError(res, error, "Failed to create agent task");
    }
  });

  // Next queued task — filtered to caller's brands.
  app.get("/api/agent-tasks/next", async (req, res) => {
    try {
      const user = requireUser(req);
      const brandIds = await getUserBrandIds(user.id);
      const task = await storage.getNextQueuedTask();
      if (!task || !task.brandId || !brandIds.has(task.brandId)) {
        return res.json({ success: true, data: null });
      }
      res.json({ success: true, data: task });
    } catch (error) {
      sendError(res, error, "Failed to fetch next queued task");
    }
  });

  app.get("/api/agent-tasks/stats", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId } = req.query;
      // Previously fell back to getAgentTaskStats(undefined) when brandId
      // was missing — that returned global counts across all tenants. Now
      // brandId is required.
      if (!brandId || typeof brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId query param is required" });
      }
      await requireBrand(brandId, user.id);
      const stats = await storage.getAgentTaskStats(brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      sendError(res, error, "Failed to fetch agent task stats");
    }
  });

  app.get("/api/agent-tasks/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const task = await requireAgentTask(req.params.id, user.id);
      res.json({ success: true, data: task });
    } catch (error) {
      sendError(res, error, "Failed to fetch agent task");
    }
  });

  app.patch("/api/agent-tasks/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAgentTask(req.params.id, user.id);
      const update = pickFields<any>(req.body, AGENT_TASK_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const task = await storage.updateAgentTask(req.params.id, update as any);
      if (!task) return res.status(404).json({ success: false, error: "Agent task not found" });
      res.json({ success: true, data: task });
    } catch (error) {
      sendError(res, error, "Failed to update agent task");
    }
  });

  app.delete("/api/agent-tasks/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAgentTask(req.params.id, user.id);
      const deleted = await storage.deleteAgentTask(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Agent task not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete agent task");
    }
  });

  // Task execution endpoint. Each task type performs a real side effect
  // and links its artifact (content job, citation run, outreach email,
  // hallucination row) back onto the agent_task row so the UI can click
  // through to the result.
  //
  // Concurrency / idempotency: claimAgentTask() atomically flips queued →
  // in_progress; concurrent clicks return 409. If any step throws, the
  // finally block transitions the task to failed so it never gets stuck
  // in_progress. State writes go through assertTransition.
  app.post("/api/agent-tasks/:id/execute", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAgentTask(req.params.id, user.id);
      const { executeAgentTask, AgentTaskExecutionError } =
        await import("../lib/agentTaskExecutor");
      try {
        const out = await executeAgentTask(req.params.id, user.id);
        return res.json({
          success: true,
          data: {
            task: out.task,
            result: out.result,
            tokensUsed: out.tokensUsed,
            artifactType: out.artifactType,
            artifactId: out.artifactId,
          },
        });
      } catch (err) {
        if (err instanceof AgentTaskExecutionError) {
          if (err.code === "unknown_type" || err.code === "invalid_input") {
            return res.status(400).json({ success: false, error: err.message });
          }
          if (err.code === "not_claimable") {
            return res.status(409).json({ success: false, error: err.message });
          }
          if (err.code === "not_found") {
            return res.status(404).json({ success: false, error: err.message });
          }
          return res.status(500).json({ success: false, error: err.message, task: err.task });
        }
        if (err instanceof InvalidStateTransitionError) {
          return res.status(409).json({ success: false, error: err.message });
        }
        throw err;
      }
    } catch (error) {
      sendError(res, error, "Failed to execute task");
    }
  });

  // Execute next queued task — scoped to caller's brands. Uses the same
  // atomic claim so two polling workers can't grab the same task.
  app.post("/api/agent-tasks/execute-next", async (req, res) => {
    try {
      const user = requireUser(req);
      const brandIds = await getUserBrandIds(user.id);
      const task = await storage.getNextQueuedTask();
      if (!task || !task.brandId || !brandIds.has(task.brandId)) {
        return res.json({ success: true, data: null, message: "No queued tasks" });
      }
      const claimed = await storage.claimAgentTask(task.id);
      if (!claimed) {
        return res.json({ success: true, data: null, message: "Task already claimed" });
      }
      res.json({ success: true, data: claimed, message: "Task execution started" });
    } catch (error) {
      sendError(res, error, "Failed to execute next task");
    }
  });

  // Outreach Campaign routes
  app.get("/api/outreach-campaigns/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId } = req.params;
      await requireBrand(brandId, user.id);
      const { status, campaignType } = req.query;
      const filters: { status?: string; campaignType?: string } = {};
      if (status) filters.status = status as string;
      if (campaignType) filters.campaignType = campaignType as string;
      const campaigns = await storage.getOutreachCampaigns(brandId, filters);
      res.json({ success: true, data: campaigns });
    } catch (error) {
      sendError(res, error, "Failed to fetch outreach campaigns");
    }
  });

  const OUTREACH_CAMPAIGN_WRITE_FIELDS = [
    "brandId",
    "campaignName",
    "campaignType",
    "targetPublicationId",
    "targetDomain",
    "targetContactEmail",
    "targetContactName",
    "status",
    "emailSubject",
    "emailBody",
    "pitchAngle",
    "proposedTopic",
    "linkedArticleId",
    "authorityScore",
    "expectedImpact",
    "aiGeneratedDraft",
    "sentAt",
    "lastFollowUpAt",
    "followUpCount",
    "responseReceivedAt",
    "responseNotes",
    "resultUrl",
    "metadata",
  ] as const;

  app.post("/api/outreach-campaigns", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, OUTREACH_CAMPAIGN_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (body.linkedArticleId && typeof body.linkedArticleId === "string") {
        await requireArticle(body.linkedArticleId, user.id);
      }
      const campaign = await storage.createOutreachCampaign(body as any);
      res.json({ success: true, data: campaign });
    } catch (error) {
      sendError(res, error, "Failed to create outreach campaign");
    }
  });

  app.get("/api/outreach-campaigns/stats/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId } = req.params;
      await requireBrand(brandId, user.id);
      const stats = await storage.getOutreachStats(brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      sendError(res, error, "Failed to fetch outreach stats");
    }
  });

  app.get("/api/outreach-campaigns/detail/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const campaign = await requireOutreachCampaign(req.params.id, user.id);
      res.json({ success: true, data: campaign });
    } catch (error) {
      sendError(res, error, "Failed to fetch outreach campaign");
    }
  });

  app.patch("/api/outreach-campaigns/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireOutreachCampaign(req.params.id, user.id);
      const update = pickFields<any>(req.body, OUTREACH_CAMPAIGN_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const campaign = await storage.updateOutreachCampaign(req.params.id, update as any);
      if (!campaign)
        return res.status(404).json({ success: false, error: "Outreach campaign not found" });
      res.json({ success: true, data: campaign });
    } catch (error) {
      sendError(res, error, "Failed to update outreach campaign");
    }
  });

  app.delete("/api/outreach-campaigns/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireOutreachCampaign(req.params.id, user.id);
      const deleted = await storage.deleteOutreachCampaign(req.params.id);
      if (!deleted)
        return res.status(404).json({ success: false, error: "Outreach campaign not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete outreach campaign");
    }
  });

  // Automation Rules routes removed — the workflow engine
  // (server/lib/workflowEngine.ts) is the replacement. The
  // automation_rules table is intentionally left in place so existing
  // rows stay readable; no new writes go through the API.

  // Automation Execution routes
  app.get("/api/automation-executions/:ruleId", async (req, res) => {
    try {
      const user = requireUser(req);
      // Verify user owns the rule whose executions they're asking for.
      await requireAutomationRule(req.params.ruleId, user.id);
      const { limit } = req.query;
      const executions = await storage.getAutomationExecutions(
        req.params.ruleId,
        limit ? parseInt(limit as string) : undefined,
      );
      res.json({ success: true, data: executions });
    } catch (error) {
      sendError(res, error, "Failed to fetch automation executions");
    }
  });

  app.post("/api/automation-executions", async (req, res) => {
    try {
      const user = requireUser(req);
      const {
        automationRuleId,
        brandId,
        triggerData,
        executionStatus,
        resultSummary,
        errorMessage,
        agentTaskId,
      } = req.body ?? {};
      if (automationRuleId) await requireAutomationRule(automationRuleId, user.id);
      if (brandId) await requireBrand(brandId, user.id);
      const execution = await storage.createAutomationExecution({
        automationRuleId,
        brandId,
        triggerData,
        executionStatus,
        resultSummary,
        errorMessage,
        agentTaskId,
      });
      res.json({ success: true, data: execution });
    } catch (error) {
      sendError(res, error, "Failed to create automation execution");
    }
  });

  app.patch("/api/automation-executions/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      // automationExecutions don't have a direct require* helper; verify via
      // the rule's brand ownership before updating.
      const { db } = await import("../db");
      const schema = await import("@shared/schema");
      const { eq: eqOp } = await import("drizzle-orm");
      const [row] = await db
        .select()
        .from(schema.automationExecutions)
        .where(eqOp(schema.automationExecutions.id, req.params.id))
        .limit(1);
      if (!row)
        return res.status(404).json({ success: false, error: "Automation execution not found" });
      if (row.automationRuleId) {
        await requireAutomationRule(row.automationRuleId, user.id);
      } else if (row.brandId) {
        await requireBrand(row.brandId, user.id);
      } else {
        return res.status(404).json({ success: false, error: "Automation execution not found" });
      }
      const update = pickFields<any>(req.body, [
        "executionStatus",
        "resultSummary",
        "errorMessage",
        "completedAt",
        "metadata",
      ] as const);
      const execution = await storage.updateAutomationExecution(req.params.id, update as any);
      if (!execution)
        return res.status(404).json({ success: false, error: "Automation execution not found" });
      res.json({ success: true, data: execution });
    } catch (error) {
      sendError(res, error, "Failed to update automation execution");
    }
  });

  // Publication Target routes
  app.get("/api/publication-targets/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId } = req.params;
      await requireBrand(brandId, user.id);
      const { status, category, industry } = req.query;
      const filters: { status?: string; category?: string; industry?: string } = {};
      if (status) filters.status = status as string;
      if (category) filters.category = category as string;
      if (industry) filters.industry = industry as string;
      const targets = await storage.getPublicationTargets(brandId, filters);
      res.json({ success: true, data: targets });
    } catch (error) {
      sendError(res, error, "Failed to fetch publication targets");
    }
  });

  const PUBLICATION_TARGET_WRITE_FIELDS = [
    "brandId",
    "publicationName",
    "domain",
    "category",
    "industry",
    "domainAuthority",
    "monthlyTraffic",
    "acceptsGuestPosts",
    "acceptsPRPitches",
    "relevanceScore",
    "contactName",
    "contactEmail",
    "contactRole",
    "contactLinkedIn",
    "contactTwitter",
    "submissionUrl",
    "editorialGuidelines",
    "pitchNotes",
    "status",
    "discoveredBy",
    "metadata",
  ] as const;

  app.post("/api/publication-targets", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, PUBLICATION_TARGET_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const target = await storage.createPublicationTarget(body as any);
      res.json({ success: true, data: target });
    } catch (error) {
      sendError(res, error, "Failed to create publication target");
    }
  });

  app.post("/api/publication-targets/discover", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, industry } = req.body ?? {};
      if (!brandId || !industry) {
        return res.status(400).json({ success: false, error: "brandId and industry are required" });
      }
      await requireBrand(brandId, user.id);
      const discovered = await storage.discoverPublications(brandId, industry);
      res.json({
        success: true,
        data: discovered,
        message: `Discovered ${discovered.length} publications`,
      });
    } catch (error) {
      sendError(res, error, "Failed to discover publications");
    }
  });

  app.post("/api/publication-targets/:id/find-contacts", async (req, res) => {
    try {
      const user = requireUser(req);
      await requirePublicationTarget(req.params.id, user.id);
      const updated = await storage.findContacts(req.params.id);
      if (!updated)
        return res.status(404).json({ success: false, error: "Publication target not found" });
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to find contacts");
    }
  });

  app.get("/api/publication-targets/detail/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const target = await requirePublicationTarget(req.params.id, user.id);
      res.json({ success: true, data: target });
    } catch (error) {
      sendError(res, error, "Failed to fetch publication target");
    }
  });

  app.patch("/api/publication-targets/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requirePublicationTarget(req.params.id, user.id);
      const update = pickFields<any>(req.body, PUBLICATION_TARGET_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const target = await storage.updatePublicationTarget(req.params.id, update as any);
      if (!target)
        return res.status(404).json({ success: false, error: "Publication target not found" });
      res.json({ success: true, data: target });
    } catch (error) {
      sendError(res, error, "Failed to update publication target");
    }
  });

  app.delete("/api/publication-targets/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requirePublicationTarget(req.params.id, user.id);
      const deleted = await storage.deletePublicationTarget(req.params.id);
      if (!deleted)
        return res.status(404).json({ success: false, error: "Publication target not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete publication target");
    }
  });

  // Outreach Email routes
  app.get("/api/outreach-emails/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId } = req.params;
      await requireBrand(brandId, user.id);
      const { status, campaignId } = req.query;
      const filters: { status?: string; campaignId?: string } = {};
      if (status) filters.status = status as string;
      if (campaignId) filters.campaignId = campaignId as string;
      const emails = await storage.getOutreachEmails(brandId, filters);
      res.json({ success: true, data: emails });
    } catch (error) {
      sendError(res, error, "Failed to fetch outreach emails");
    }
  });

  app.get("/api/outreach-emails/stats/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrand(req.params.brandId, user.id);
      const stats = await storage.getOutreachEmailStats(req.params.brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      sendError(res, error, "Failed to fetch email stats");
    }
  });

  const OUTREACH_EMAIL_WRITE_FIELDS = [
    "campaignId",
    "publicationTargetId",
    "brandId",
    "recipientEmail",
    "recipientName",
    "subject",
    "body",
    "emailType",
    "status",
    "scheduledFor",
    "sentAt",
    "openedAt",
    "clickedAt",
    "repliedAt",
    "openCount",
    "clickCount",
    "replyContent",
    "error",
    "trackingId",
    "metadata",
  ] as const;

  app.post("/api/outreach-emails", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, OUTREACH_EMAIL_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const email = await storage.createOutreachEmail(body as any);
      res.json({ success: true, data: email });
    } catch (error) {
      sendError(res, error, "Failed to create outreach email");
    }
  });

  // NOTE: sendOutreachEmail is currently a Math.random() mock in storage.
  // Leaving this route functional but marked pending — user has been
  // informed that outreach isn't actually sending real email.
  app.post("/api/outreach-emails/:id/send", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireOutreachEmail(req.params.id, user.id);
      const sent = await storage.sendOutreachEmail(req.params.id);
      if (!sent) return res.status(404).json({ success: false, error: "Outreach email not found" });
      res.json({ success: true, data: sent });
    } catch (error) {
      sendError(res, error, "Failed to send email");
    }
  });

  app.get("/api/outreach-emails/detail/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const email = await requireOutreachEmail(req.params.id, user.id);
      res.json({ success: true, data: email });
    } catch (error) {
      sendError(res, error, "Failed to fetch outreach email");
    }
  });

  app.patch("/api/outreach-emails/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireOutreachEmail(req.params.id, user.id);
      const update = pickFields<any>(req.body, OUTREACH_EMAIL_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const email = await storage.updateOutreachEmail(req.params.id, update as any);
      if (!email)
        return res.status(404).json({ success: false, error: "Outreach email not found" });
      res.json({ success: true, data: email });
    } catch (error) {
      sendError(res, error, "Failed to update outreach email");
    }
  });

  app.delete("/api/outreach-emails/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireOutreachEmail(req.params.id, user.id);
      const deleted = await storage.deleteOutreachEmail(req.params.id);
      if (!deleted)
        return res.status(404).json({ success: false, error: "Outreach email not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete outreach email");
    }
  });

  // --- Workflow run endpoints ------------------------------------------
  // Lazy-loaded inside each handler so HMR doesn't capture stale modules.

  async function requireRunOwnership(runId: string, userId: string) {
    const { workflowStorage } = await import("../storage/workflowStorage");
    const run = await workflowStorage.getRun(runId);
    if (!run) return null;
    // Verify brand ownership. requireBrand throws (ForbiddenError) on miss.
    await requireBrand(run.brandId, userId);
    return run;
  }

  app.post("/api/workflows/:key/start", async (req, res) => {
    try {
      const user = requireUser(req);
      const { key } = req.params;
      const { brandId, input } = req.body ?? {};
      if (!brandId || typeof brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(brandId, user.id);
      const { startRun } = await import("../lib/workflowEngine");
      const run = await startRun(key, brandId, user.id, input ?? {}, "manual");
      res.json({ success: true, data: { runId: run.id, run } });
    } catch (error) {
      sendError(res, error, "Failed to start workflow");
    }
  });

  app.get("/api/workflow-runs", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, status } = req.query;
      if (!brandId || typeof brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(brandId, user.id);
      const { workflowStorage } = await import("../storage/workflowStorage");
      const ACTIVE_STATUSES = new Set(["pending", "running", "awaiting_approval"]);
      const statusParam = typeof status === "string" ? status : undefined;
      let runs = await workflowStorage.getRunsByBrand(brandId, {
        status: statusParam && statusParam !== "active" ? statusParam : undefined,
      });
      if (statusParam === "active") {
        runs = runs.filter((r) => ACTIVE_STATUSES.has(r.status));
      }
      res.json({ success: true, data: runs });
    } catch (error) {
      sendError(res, error, "Failed to list workflow runs");
    }
  });

  app.get("/api/workflow-runs/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const run = await requireRunOwnership(req.params.id, user.id);
      if (!run) return res.status(404).json({ success: false, error: "Workflow run not found" });
      const { workflowStorage } = await import("../storage/workflowStorage");
      const stepStates = (run.stepStates as Array<{ status?: string }>) || [];
      let pendingApproval = null;
      if (run.status === "awaiting_approval" || run.status === "running") {
        pendingApproval = await workflowStorage.getPendingApproval(run.id, run.currentStepIndex);
      }
      res.json({ success: true, data: { ...run, stepStates, pendingApproval } });
    } catch (error) {
      sendError(res, error, "Failed to fetch workflow run");
    }
  });

  app.post("/api/workflow-runs/:id/approve", async (req, res) => {
    try {
      const user = requireUser(req);
      const run = await requireRunOwnership(req.params.id, user.id);
      if (!run) return res.status(404).json({ success: false, error: "Workflow run not found" });
      const { stepIndex, decision, payload } = req.body ?? {};
      if (typeof stepIndex !== "number" || (decision !== "approved" && decision !== "rejected")) {
        return res.status(400).json({
          success: false,
          error: "stepIndex (number) and decision ('approved'|'rejected') are required",
        });
      }
      const safePayload =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : undefined;
      const { approveStep } = await import("../lib/workflowEngine");
      await approveStep(run.id, stepIndex, decision, safePayload);
      const { workflowStorage } = await import("../storage/workflowStorage");
      const updated = await workflowStorage.getRun(run.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to approve workflow step");
    }
  });

  app.post("/api/workflow-runs/:id/cancel", async (req, res) => {
    try {
      const user = requireUser(req);
      const run = await requireRunOwnership(req.params.id, user.id);
      if (!run) return res.status(404).json({ success: false, error: "Workflow run not found" });
      const { cancelRun } = await import("../lib/workflowEngine");
      await cancelRun(run.id);
      const { workflowStorage } = await import("../storage/workflowStorage");
      const updated = await workflowStorage.getRun(run.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to cancel workflow run");
    }
  });
}
