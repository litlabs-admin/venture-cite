import { z } from "zod";
import { storage } from "../storage";
import { MODELS } from "./modelConfig";
import { openai } from "./routesShared";
import { isKnownAgentTaskType, parseAgentTaskInput, type AgentTaskType } from "./agentTaskSchemas";
import { parseLLMJson, LLMParseError } from "./llmParse";
import { assertTransition, InvalidStateTransitionError } from "./statusTransitions";
import { logger } from "./logger";
import type { AgentTask } from "@shared/schema";

export class AgentTaskExecutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "unknown_type"
      | "invalid_input"
      | "not_claimable"
      | "handler_failed"
      | "not_found",
    public readonly task?: AgentTask,
  ) {
    super(message);
    this.name = "AgentTaskExecutionError";
  }
}

export type ExecuteResult = {
  task: AgentTask;
  result: unknown;
  tokensUsed: number;
  artifactType: string | null;
  artifactId: string | null;
};

export async function executeAgentTask(taskId: string, userId: string): Promise<ExecuteResult> {
  const task = await storage.getAgentTaskById(taskId);
  if (!task) {
    throw new AgentTaskExecutionError(`Task ${taskId} not found`, "not_found");
  }

  if (!isKnownAgentTaskType(task.taskType)) {
    throw new AgentTaskExecutionError(`Unknown taskType: ${task.taskType}`, "unknown_type", task);
  }

  let input: Record<string, unknown>;
  try {
    input = parseAgentTaskInput(task.taskType as AgentTaskType, task.inputData) as Record<
      string,
      unknown
    >;
  } catch (err) {
    const msg =
      err instanceof z.ZodError ? err.issues.map((i) => i.message).join("; ") : String(err);
    throw new AgentTaskExecutionError(`Invalid inputData: ${msg}`, "invalid_input", task);
  }

  const claimed = await storage.claimAgentTask(task.id);
  if (!claimed) {
    throw new AgentTaskExecutionError(
      `Task is not claimable (current status: ${task.status})`,
      "not_claimable",
      task,
    );
  }

  let claimedTaskId: string | null = claimed.id;
  let result: Record<string, unknown> = { success: false, output: "" };
  let tokensUsed = 0;
  let artifactType: string | null = null;
  let artifactId: string | null = null;

  try {
    switch (task.taskType as AgentTaskType) {
      case "content_generation": {
        if (!task.brandId) throw new Error("content_generation task requires a brandId");
        const brand = await storage.getBrandById(task.brandId);
        if (!brand) throw new Error("Brand not found for content_generation task");
        const rawKeywords = (input.keywords as string | undefined) ?? "";
        const keywords = rawKeywords.trim();
        const taskTitle = (task.taskTitle ?? "").trim();
        // Fail fast rather than silently generating "ai citation content" on
        // missing keywords with a default/empty title.
        if (!keywords && (!taskTitle || taskTitle.toLowerCase() === "generate article")) {
          throw new Error("keywords required for content generation");
        }
        const { enqueueContentGenerationJob } = await import("../contentGenerationWorker");
        const payload = {
          keywords: keywords || taskTitle,
          industry: (input.industry as string) || brand.industry || "general",
          type: (input.type as string) || "article",
          brandId: brand.id,
          humanize: input.humanize !== false,
          targetCustomers: input.targetCustomers as string | undefined,
          geography: input.geography as string | undefined,
          contentStyle: (input.contentStyle as string) || "b2c",
        };
        const jobId = await enqueueContentGenerationJob(
          userId,
          brand.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload as any,
        );
        artifactType = "content_job";
        artifactId = jobId;
        result = {
          success: true,
          action: "content_generation_enqueued",
          jobId,
          output: `Article generation job ${jobId} enqueued. Poll GET /api/content-jobs/${jobId} for progress.`,
        };
        break;
      }

      case "outreach": {
        if (!task.brandId) throw new Error("outreach task requires a brandId");
        const brand = await storage.getBrandById(task.brandId);
        if (!brand) throw new Error("Brand not found for outreach task");

        const targetDomain = (input.targetDomain as string) || "";
        const recipientEmail =
          (input.recipientEmail as string) || (input.contactEmail as string) || "";
        if (!recipientEmail) {
          throw new Error("recipientEmail required for outreach task");
        }
        const campaignId = (input.campaignId as string) || null;
        const publicationTargetId = (input.publicationTargetId as string) || null;
        const pitchAngle = (input.pitchAngle as string) || task.taskDescription || "";

        const response = await openai.chat.completions.create({
          model: MODELS.misc,
          response_format: { type: "json_object" },
          max_tokens: 800,
          messages: [
            {
              role: "system",
              content: `You are an expert PR outreach specialist. Draft a guest-post pitch email. Return JSON: {"subject": string (max 80 chars), "body": string (3-5 short paragraphs, signed "${brand.name}")}.`,
            },
            {
              role: "user",
              content: `Brand: ${brand.name} (${brand.industry})
Description: ${brand.description || "N/A"}
Target domain: ${targetDomain || "not specified"}
Pitch angle: ${pitchAngle || "establish ourselves as a source"}
Task: ${task.taskTitle}`,
            },
          ],
        });
        tokensUsed = response.usage?.total_tokens || 0;

        const outreachSchema = z.object({
          subject: z.string().min(1).max(200),
          body: z.string().min(1),
        });
        let subject: string;
        let body: string;
        const raw = response.choices[0]?.message?.content || "";
        try {
          const parsed = parseLLMJson(raw, outreachSchema);
          subject = parsed.subject.slice(0, 200);
          body = parsed.body;
        } catch (err) {
          if (err instanceof LLMParseError) {
            logger.warn(
              { err: err.message, brandId: brand.id, taskId: task.id },
              "outreach: LLM returned non-conforming JSON",
            );
            throw new Error("Outreach LLM returned unparseable response");
          }
          throw err;
        }

        const email = await storage.createOutreachEmail({
          brandId: brand.id,
          campaignId,
          publicationTargetId,
          recipientEmail,
          recipientName: (input.recipientName as string) || null,
          subject,
          body,
          emailType: (input.emailType as string) || "initial",
          status: "draft",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        artifactType = "outreach_email";
        artifactId = email.id;
        result = {
          success: true,
          action: "outreach_email_drafted",
          emailId: email.id,
          subject,
          bodyPreview: body.slice(0, 200),
          output: `Drafted outreach_emails row ${email.id} (status=draft). Review and click Send when ready.`,
        };
        break;
      }

      case "prompt_test": {
        if (!task.brandId) throw new Error("prompt_test task requires a brandId");
        const { runBrandPrompts } = await import("../citationChecker");
        const inputPromptIds = Array.isArray(input.promptIds)
          ? (input.promptIds as string[]).filter((x) => typeof x === "string" && x.length > 0)
          : undefined;
        const triggeredBy = task.triggeredBy === "cron" ? "cron" : "manual";
        const runResult = await runBrandPrompts(task.brandId, undefined, {
          triggeredBy,
          promptIds: inputPromptIds && inputPromptIds.length > 0 ? inputPromptIds : undefined,
        });
        // Per-prompt roll-up. Shape consumed by weeklyCatchup + fixLosingArticle
        // + winAPrompt: `{promptId, cited, checks, platforms, bestRank}[]` where
        // `cited` and `checks` are counts across platforms. `platforms` is the
        // list of platforms with a citation (empty = not cited anywhere).
        const byPromptMap = new Map<
          string,
          {
            promptId: string;
            cited: number;
            checks: number;
            platforms: string[];
            bestRank: number | null;
            citationContexts: string[];
          }
        >();
        for (const r of runResult.rankings) {
          const key = r.brandPromptId as string;
          const entry = byPromptMap.get(key) ?? {
            promptId: key,
            cited: 0,
            checks: 0,
            platforms: [] as string[],
            bestRank: null as number | null,
            citationContexts: [] as string[],
          };
          entry.checks += 1;
          if (r.isCited === 1) {
            entry.cited += 1;
            if (r.aiPlatform && !entry.platforms.includes(r.aiPlatform)) {
              entry.platforms.push(r.aiPlatform);
            }
            if (r.rank !== null && r.rank !== undefined) {
              entry.bestRank = entry.bestRank === null ? r.rank : Math.min(entry.bestRank, r.rank);
            }
            if (r.citationContext && entry.citationContexts.length < 3) {
              entry.citationContexts.push(String(r.citationContext).slice(0, 400));
            }
          }
          byPromptMap.set(key, entry);
        }
        const byPrompt = Array.from(byPromptMap.values());
        artifactType = "citation_run";
        artifactId = runResult.runId;
        result = {
          success: true,
          action: "citation_run_completed",
          runId: runResult.runId,
          totalChecks: runResult.totalChecks,
          totalCited: runResult.totalCited,
          citationRate:
            runResult.totalChecks > 0
              ? Math.round((runResult.totalCited / runResult.totalChecks) * 100)
              : 0,
          byPrompt,
          output: `Citation run ${runResult.runId}: ${runResult.totalCited}/${runResult.totalChecks} cited.`,
        };
        break;
      }

      case "source_analysis": {
        if (!task.brandId) throw new Error("source_analysis task requires a brandId");
        const limit = (input.limit as number) || 25;
        const mode = ((input.mode as string) || "brand") as
          | "brand"
          | "prompt"
          | "listicles_for_prompt";

        if (mode === "brand") {
          const top = await storage.getTopAiSources(task.brandId, limit);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const byType = top.reduce<Record<string, number>>((acc, s: any) => {
            const t = s.sourceType || "web";
            acc[t] = (acc[t] || 0) + (s.occurrenceCount || 1);
            return acc;
          }, {});
          artifactType = "source_analysis";
          artifactId = null;
          result = {
            success: true,
            action: "source_analysis_computed",
            mode,
            topSources: top.slice(0, 10),
            sourceTypeBreakdown: byType,
            totalSourcesFound: top.length,
            output: `${top.length} citing sources found. Top 3: ${top
              .slice(0, 3)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((s: any) => s.sourceDomain || s.sourceUrl)
              .join(", ")}`,
          };
          break;
        }

        const promptId = input.promptId as string | undefined;
        if (!promptId) {
          throw new Error(`source_analysis mode=${mode} requires input.promptId`);
        }

        if (mode === "prompt") {
          const { db } = await import("../db");
          const schema = await import("@shared/schema");
          const { and: andOp, eq: eqOp } = await import("drizzle-orm");
          const rows = await db
            .select()
            .from(schema.geoRankings)
            .where(
              andOp(
                eqOp(schema.geoRankings.brandPromptId, promptId),
                eqOp(schema.geoRankings.isCited, 1),
              ),
            );
          // Group by host (normalized citingOutletUrl).
          const byHost = new Map<
            string,
            { url: string; host: string; citationCount: number; contextSample: string }
          >();
          for (const r of rows) {
            const rawUrl = r.citingOutletUrl;
            if (!rawUrl) continue;
            let host = "";
            try {
              host = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`).hostname
                .toLowerCase()
                .replace(/^www\./, "");
            } catch {
              continue;
            }
            if (!host) continue;
            const existing = byHost.get(host);
            if (existing) {
              existing.citationCount += 1;
              if (!existing.contextSample && r.citationContext) {
                existing.contextSample = String(r.citationContext).slice(0, 600);
              }
            } else {
              byHost.set(host, {
                url: rawUrl,
                host,
                citationCount: 1,
                contextSample: r.citationContext ? String(r.citationContext).slice(0, 600) : "",
              });
            }
          }
          const topPages = Array.from(byHost.values())
            .sort((a, b) => b.citationCount - a.citationCount)
            .slice(0, limit);

          // LLM summary on the top 3 pages — "what this page has that
          // the brand doesn't". Non-fatal: empty arrays pass through.
          let summary = "";
          let missingAngles: string[] = [];
          const topThree = topPages.slice(0, 3);
          if (topThree.length > 0) {
            const brand = await storage.getBrandById(task.brandId);
            const brandBlurb = brand
              ? `${brand.name} (${brand.industry ?? "general"}): ${brand.description ?? ""}`
              : task.brandId;
            const pagesBlurb = topThree
              .map(
                (p, i) =>
                  `#${i + 1} ${p.host} (${p.citationCount}× cited)\nContext: ${p.contextSample || "(none)"}`,
              )
              .join("\n\n");
            try {
              const resp = await openai.chat.completions.create({
                model: MODELS.misc,
                response_format: { type: "json_object" },
                max_tokens: 500,
                messages: [
                  {
                    role: "system",
                    content:
                      'You are a content-gap analyst. Given a brand and the top 3 pages that AI search engines cite for a specific prompt, explain what these pages have that the brand does not. Return JSON: {"summary": string (2-3 sentences), "missingAngles": string[] (3-5 short phrases)}.',
                  },
                  {
                    role: "user",
                    content: `Brand: ${brandBlurb}\n\nTop citing pages for this prompt:\n${pagesBlurb}`,
                  },
                ],
              });
              tokensUsed = resp.usage?.total_tokens || 0;
              const gapSchema = z.object({
                summary: z.string(),
                missingAngles: z.array(z.string()).max(8),
              });
              const parsed = parseLLMJson(resp.choices[0]?.message?.content ?? "", gapSchema);
              summary = parsed.summary;
              missingAngles = parsed.missingAngles;
            } catch (err) {
              if (!(err instanceof LLMParseError)) {
                logger.warn({ err, promptId }, "source_analysis gap LLM failed");
              }
            }
          }

          artifactType = "source_analysis";
          artifactId = null;
          if (topPages.length === 0) {
            result = {
              success: true,
              action: "source_analysis_computed",
              mode,
              promptId,
              empty: true,
              reason: "No cited outlets found for this prompt",
              topPages: [],
              summary: "",
              missingAngles: [],
              output: `No citing pages found for prompt ${promptId}.`,
            };
          } else {
            result = {
              success: true,
              action: "source_analysis_computed",
              mode,
              promptId,
              topPages,
              summary,
              missingAngles,
              output: `${topPages.length} citing pages for prompt ${promptId}.`,
            };
          }
          break;
        }

        if (mode === "listicles_for_prompt") {
          // Match listicles.keyword against the prompt's text (simple
          // case-insensitive substring match on either direction).
          const prompt = (await storage.getBrandPromptsByBrandId(task.brandId)).find(
            (p) => p.id === promptId,
          );
          if (!prompt) {
            throw new Error(`Brand prompt ${promptId} not found for brand ${task.brandId}`);
          }
          const { db } = await import("../db");
          const schema = await import("@shared/schema");
          const { eq: eqOp } = await import("drizzle-orm");
          const allListicles = await db
            .select()
            .from(schema.listicles)
            .where(eqOp(schema.listicles.brandId, task.brandId));
          const promptText = (prompt.prompt || "").toLowerCase();
          const matched = allListicles
            .filter((l) => {
              const kw = (l.keyword || "").toLowerCase();
              if (!kw) return false;
              return promptText.includes(kw) || kw.includes(promptText);
            })
            .slice(0, limit)
            .map((l) => {
              let domain = "";
              try {
                domain = new URL(l.url.startsWith("http") ? l.url : `https://${l.url}`).hostname
                  .toLowerCase()
                  .replace(/^www\./, "");
              } catch {
                /* leave blank */
              }
              return {
                id: l.id,
                url: l.url,
                domain,
                title: l.title,
                isIncluded: l.isIncluded === 1,
                listPosition: l.listPosition ?? null,
                totalListItems: l.totalListItems ?? null,
                email: null as string | null,
              };
            });
          artifactType = "source_analysis";
          artifactId = null;
          if (matched.length === 0) {
            result = {
              success: true,
              action: "source_analysis_computed",
              mode,
              promptId,
              empty: true,
              reason: "No listicles matched this prompt",
              listicles: [],
              output: `No listicles matched prompt ${promptId}.`,
            };
          } else {
            result = {
              success: true,
              action: "source_analysis_computed",
              mode,
              promptId,
              listicles: matched,
              output: `${matched.length} listicle(s) matched prompt ${promptId}.`,
            };
          }
          break;
        }

        throw new Error(`Unknown source_analysis mode: ${mode}`);
      }

      case "hallucination_remediation": {
        if (!task.brandId) throw new Error("hallucination_remediation task requires a brandId");
        const hallucinationId = input.hallucinationId as string;
        const brand = await storage.getBrandById(task.brandId);
        const allHalls = await storage.getBrandHallucinations(task.brandId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hall = allHalls.find((h: any) => h.id === hallucinationId);
        if (!hall) throw new Error(`Hallucination ${hallucinationId} not found`);
        if (hall.brandId !== task.brandId) {
          throw new Error("Hallucination does not belong to task's brand");
        }

        assertTransition(
          "hallucination_remediation",
          hall.remediationStatus as string | null | undefined,
          "in_progress",
        );

        let factsBlurb = "";
        let hasFacts = false;
        try {
          const facts = (await storage.getBrandFacts(task.brandId))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((f: any) => f.isActive !== 0)
            .slice(0, 30)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((f: any) => `- ${f.factCategory}/${f.factKey}: ${f.factValue}`)
            .join("\n");
          if (facts) {
            factsBlurb = `\n\nBrand fact sheet (use these as ground truth):\n${facts}`;
            hasFacts = true;
          }
        } catch {
          /* non-fatal */
        }

        const systemPrompt = hasFacts
          ? `You are a brand-accuracy specialist. Given a specific AI hallucination about a brand and the brand's verified fact sheet, propose 3-6 concrete remediation steps the brand's team can take right now (publish a clarifying post, update Wikipedia, email the AI vendor's feedback form, add to their brand_fact_sheet, etc.). Ground every step in the fact sheet where possible. Return JSON: {"remediationSteps": string[], "priority": "low"|"medium"|"high"}.`
          : `You are a brand-accuracy specialist. No brand fact sheet available — propose generic remediation steps based on the hallucination context only. Suggest 3-6 concrete actions the brand's team can take (publish a clarifying blog post, correct Wikipedia, submit vendor feedback, populate a fact sheet to prevent recurrence, etc.). Return JSON: {"remediationSteps": string[], "priority": "low"|"medium"|"high"}.`;

        const response = await openai.chat.completions.create({
          model: MODELS.misc,
          response_format: { type: "json_object" },
          max_tokens: 800,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: `Brand: ${brand?.name || "N/A"}
AI platform: ${hall.aiPlatform}
What the AI claimed: ${hall.claimedStatement}
Actual fact: ${hall.actualFact || "not provided"}
Severity: ${hall.severity}${factsBlurb}`,
            },
          ],
        });
        tokensUsed = response.usage?.total_tokens || 0;

        const remediationSchema = z.object({
          remediationSteps: z.array(z.string()).min(1).max(12),
          priority: z.enum(["low", "medium", "high"]).optional(),
        });
        let steps: string[] = [];
        try {
          const parsed = parseLLMJson(
            response.choices[0]?.message?.content ?? "",
            remediationSchema,
          );
          steps = parsed.remediationSteps.map((s) => s.slice(0, 300)).slice(0, 8);
        } catch (err) {
          if (err instanceof LLMParseError) {
            logger.warn(
              { err: err.message, hallucinationId, brandId: task.brandId },
              "remediation: LLM returned non-conforming JSON",
            );
            throw new Error(
              `Hallucination remediation LLM returned unparseable response: ${err.message}`,
            );
          }
          throw err;
        }

        await storage.updateBrandHallucination(hallucinationId, {
          remediationSteps: steps.length > 0 ? steps : null,
          remediationStatus: "in_progress",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        artifactType = "hallucination";
        artifactId = hallucinationId;
        result = {
          success: true,
          action: "hallucination_remediation_saved",
          hallucinationId,
          remediationSteps: steps,
          output: `Saved ${steps.length} remediation step(s) to hallucination ${hallucinationId}.`,
        };
        break;
      }

      case "seo_update": {
        if (!task.brandId) throw new Error("seo_update task requires a brandId");
        const articleId = input.articleId as string;
        const article = await storage.getArticleById(articleId);
        if (!article || article.brandId !== task.brandId) {
          throw new Error(`Article ${articleId} not found for this brand`);
        }
        const { enqueueContentGenerationJob } = await import("../contentGenerationWorker");
        const jobId = await enqueueContentGenerationJob(userId, task.brandId, {
          keywords: Array.isArray(article.keywords) ? article.keywords.join(", ") : article.title,
          industry: article.industry || "general",
          type: article.contentType || "article",
          brandId: task.brandId,
          humanize: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        artifactType = "content_job";
        artifactId = jobId;
        result = {
          success: true,
          action: "seo_update_enqueued",
          jobId,
          sourceArticleId: articleId,
          output: `Refresh job ${jobId} enqueued for article ${articleId}.`,
        };
        break;
      }
    }

    assertTransition("agent_task", "in_progress", "completed");
    const updated = await storage.updateAgentTask(task.id, {
      status: "completed",
      completedAt: new Date(),
      outputData: result,
      tokensUsed,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artifactType: artifactType as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artifactId: artifactId as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    claimedTaskId = null;

    return {
      task: updated ?? task,
      result,
      tokensUsed,
      artifactType,
      artifactId,
    };
  } catch (err) {
    if (err instanceof InvalidStateTransitionError) {
      throw err;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, taskId: task.id, taskType: task.taskType }, "agent task failed");
    try {
      await storage.updateAgentTask(task.id, {
        status: "failed",
        completedAt: new Date(),
        error: errMsg,
      });
    } finally {
      claimedTaskId = null;
    }
    throw new AgentTaskExecutionError(errMsg, "handler_failed", task);
  } finally {
    if (claimedTaskId) {
      try {
        await storage.updateAgentTask(claimedTaskId, {
          status: "failed",
          completedAt: new Date(),
          error: "Execution interrupted before completion",
        });
      } catch (err) {
        logger.error({ err, claimedTaskId }, "finally: failed to mark task failed");
      }
    }
  }
}
