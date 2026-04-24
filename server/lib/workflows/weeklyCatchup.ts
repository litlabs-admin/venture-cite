import type { WorkflowDefinition, WorkflowStepContext } from "../workflowEngine";
import type { BrandHallucination, WorkflowRun } from "@shared/schema";
import OpenAI from "openai";
import { storage } from "../../storage";
import { attachAiLogger } from "../aiLogger";
import { MODELS } from "../modelConfig";
import { logger } from "../logger";
import { isEmailConfigured } from "../../emailService";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

type PromptCitationCount = {
  promptId: string;
  prompt?: string;
  cited: number;
  checks: number;
};

type CitationCheckOutput = {
  runId?: string;
  totalChecks?: number;
  totalCited?: number;
  byPrompt?: PromptCitationCount[];
};

async function loadBrandFromRun(run: WorkflowRun) {
  const brand = await storage.getBrandById(run.brandId);
  if (!brand) throw new Error(`Brand ${run.brandId} not found`);
  return brand;
}

export const weeklyCatchupWorkflow: WorkflowDefinition = {
  key: "weekly_catchup",
  name: "Weekly Catch-up",
  description:
    "Monday 06:00 UTC: citation check, delta vs last week, hallucination scan, and digest email.",
  triggerType: "cron",
  cronSpec: "0 6 * * 1",
  steps: [
    {
      key: "citation_check",
      label: "Citation check",
      description: "Run prompt tests over all tracked prompts for the brand.",
      taskType: "prompt_test",
      requiresApproval: false,
      buildInput: () => ({}),
      extractOutput: (task) => {
        const data = (task.outputData ?? {}) as CitationCheckOutput;
        return {
          runId: data.runId,
          totalChecks: data.totalChecks ?? 0,
          totalCited: data.totalCited ?? 0,
          byPrompt: data.byPrompt ?? [],
        };
      },
    },
    {
      key: "delta_calc",
      label: "Delta vs last week",
      description:
        "Compare this week's citation score and per-prompt results against the prior snapshot.",
      requiresApproval: false,
      buildInput: () => ({}),
      extractOutput: () => ({}),
      run: async (ctx: WorkflowStepContext) => {
        const citation =
          (ctx.priorOutputs.citation_check as Record<string, unknown> | undefined) ?? {};
        const byPrompt = (citation.byPrompt as PromptCitationCount[] | undefined) ?? [];
        const rawTotalChecks = Number(citation.totalChecks ?? 0);
        const totalChecks =
          Number.isFinite(rawTotalChecks) && rawTotalChecks > 0 ? rawTotalChecks : 0;
        const totalCited = Number(citation.totalCited ?? 0);
        const currentScore = totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0;

        const history = await storage.getMetricsHistory(ctx.run.brandId, "visibility_score", 14);

        // First run (or insufficient history): no delta, no prior-prompt map.
        // Do NOT access prior.metricValue when prior is undefined.
        if (history.length < 2) {
          return {
            currentScore,
            priorScore: null,
            delta: null,
            firstRun: true,
            newlyLost: [] as string[],
            newlyWon: [] as string[],
            stable: byPrompt.map((p) => p.promptId),
          };
        }

        const prior = history[history.length - 2];
        const priorScore =
          prior && prior.metricValue !== undefined && prior.metricValue !== null
            ? Number(prior.metricValue)
            : null;
        const priorDetails = (prior?.metricDetails as Record<string, unknown> | undefined) ?? {};
        const priorByPrompt = (priorDetails.byPrompt as PromptCitationCount[] | undefined) ?? [];
        const priorCitedIds = new Set(
          priorByPrompt.filter((p) => p.cited > 0).map((p) => p.promptId),
        );
        const currentCitedIds = new Set(byPrompt.filter((p) => p.cited > 0).map((p) => p.promptId));

        const newlyLost: string[] = [];
        const newlyWon: string[] = [];
        const stable: string[] = [];
        for (const p of byPrompt) {
          const wasCited = priorCitedIds.has(p.promptId);
          const isCited = currentCitedIds.has(p.promptId);
          if (wasCited && !isCited) newlyLost.push(p.promptId);
          else if (!wasCited && isCited) newlyWon.push(p.promptId);
          else stable.push(p.promptId);
        }

        return {
          currentScore,
          priorScore,
          delta: priorScore === null ? null : currentScore - priorScore,
          firstRun: false,
          newlyLost,
          newlyWon,
          stable,
        };
      },
    },
    {
      key: "hallucination_scan",
      label: "Hallucination scan",
      description: "Collect open brand hallucinations with emphasis on newly losing prompts.",
      requiresApproval: false,
      buildInput: () => ({}),
      extractOutput: () => ({}),
      run: async (ctx: WorkflowStepContext) => {
        const detected = await storage.getBrandHallucinations(ctx.run.brandId, {
          isResolved: false,
        });
        return { detected };
      },
    },
    {
      key: "spawn_remediations",
      label: "Spawn remediations",
      description: "Queue a hallucination_remediation task for each high-severity finding.",
      requiresApproval: false,
      buildInput: () => ({}),
      extractOutput: () => ({}),
      run: async (ctx: WorkflowStepContext) => {
        const scan =
          (ctx.priorOutputs.hallucination_scan as Record<string, unknown> | undefined) ?? {};
        const detected = (scan.detected as BrandHallucination[] | undefined) ?? [];
        const highSev = detected.filter((h) => h.severity === "high" || h.severity === "critical");
        const spawnedTaskIds: string[] = [];
        for (const h of highSev) {
          const t = await storage.createAgentTask({
            brandId: ctx.run.brandId,
            taskType: "hallucination_remediation",
            taskTitle: "Remediate hallucination",
            taskDescription: `Auto-spawned from weekly catch-up for hallucination ${h.id}.`,
            triggeredBy: "automation_rule",
            status: "queued",
            inputData: { hallucinationId: h.id } as never,
            workflowRunId: ctx.run.id,
            workflowStepKey: "spawn_remediations",
            priority: "high",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
          spawnedTaskIds.push(t.id);
        }
        return { spawnedTaskIds };
      },
    },
    {
      key: "compose_digest",
      label: "Compose digest",
      description: "Build the weekly digest payload with an LLM-generated top insight.",
      requiresApproval: false,
      buildInput: () => ({}),
      extractOutput: () => ({}),
      run: async (ctx: WorkflowStepContext) => {
        const brand = await loadBrandFromRun(ctx.run);
        const delta = (ctx.priorOutputs.delta_calc as Record<string, unknown> | undefined) ?? {};
        const scan =
          (ctx.priorOutputs.hallucination_scan as Record<string, unknown> | undefined) ?? {};
        const spawned =
          (ctx.priorOutputs.spawn_remediations as Record<string, unknown> | undefined) ?? {};
        const detected = (scan.detected as BrandHallucination[] | undefined) ?? [];
        const spawnedIds = (spawned.spawnedTaskIds as string[] | undefined) ?? [];
        const newlyWonCount = ((delta.newlyWon as string[] | undefined) ?? []).length;
        const newlyLostCount = ((delta.newlyLost as string[] | undefined) ?? []).length;
        const currentScore = Number(delta.currentScore ?? 0);
        const deltaValue =
          delta.delta === null || delta.delta === undefined ? null : Number(delta.delta);
        const firstRun = Boolean(delta.firstRun);
        const newlyLostIds = (delta.newlyLost as string[] | undefined) ?? [];
        const newlyWonIds = (delta.newlyWon as string[] | undefined) ?? [];

        const systemPrompt = firstRun
          ? 'You write one-sentence weekly insights for GEO citation reports. This is the first week of data — no prior comparison available. Summarize current state only; do not invent trends or deltas. Return JSON {"insight": string}. Keep it under 30 words.'
          : 'You write one-sentence weekly insights for GEO citation reports. Return JSON {"insight": string}. Keep it under 30 words.';

        let topInsight = "";
        try {
          const resp = await openai.chat.completions.create({
            model: MODELS.misc,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: JSON.stringify({
                  brand: brand.name,
                  currentScore,
                  delta: deltaValue,
                  firstRun,
                  newlyWonCount,
                  newlyLostCount,
                  hallucinationCount: detected.length,
                }),
              },
            ],
            max_tokens: 200,
            response_format: { type: "json_object" },
          });
          const raw = resp.choices[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(raw) as { insight?: string };
          topInsight = typeof parsed.insight === "string" ? parsed.insight : "";
        } catch (err) {
          logger.warn({ err, brandId: ctx.run.brandId }, "weekly_catchup: insight LLM failed");
        }

        return {
          brandName: brand.name,
          weekEnding: new Date().toISOString(),
          currentScore,
          delta: deltaValue,
          firstRun,
          newlyLost: newlyLostIds,
          newlyWon: newlyWonIds,
          newlyWonCount,
          newlyLostCount,
          hallucinationCount: detected.length,
          spawnedTaskCount: spawnedIds.length,
          topInsight,
        };
      },
    },
    {
      // The actual aggregate-and-send happens in scheduler.ts
      // (runWeeklyDigestAggregator) — which checks if ALL of a user's
      // per-brand weekly_catchup runs have reached terminal status, then
      // sends ONE digest email covering every brand. This step just records
      // completion so the scheduler can detect readiness.
      key: "send_digest_email",
      label: "Mark digest ready",
      description:
        "Record that this brand's catch-up is complete. Scheduler aggregator sends the actual user-level digest.",
      requiresApproval: false,
      buildInput: () => ({}),
      extractOutput: () => ({}),
      run: async (ctx: WorkflowStepContext) => {
        void isEmailConfigured;
        return {
          readyForDigest: true,
          userId: ctx.run.userId,
          brandId: ctx.run.brandId,
        };
      },
    },
  ],
};
