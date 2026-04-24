import type { WorkflowDefinition, WorkflowStepContext } from "../workflowEngine";
import type { Brand, BrandPrompt, WorkflowRun, AgentTask } from "@shared/schema";
import { storage } from "../../storage";

type WinAPromptInput = { promptId: string };

type Listicle = {
  id?: string;
  domain: string;
  title: string;
  email?: string | null;
  url?: string;
};

async function loadRunContext(run: WorkflowRun): Promise<{ brand: Brand; prompt: BrandPrompt }> {
  const brand = await storage.getBrandById(run.brandId);
  if (!brand) throw new Error(`Brand ${run.brandId} not found`);
  const input = (run.input as WinAPromptInput | null) ?? ({} as WinAPromptInput);
  if (!input.promptId) throw new Error("win_a_prompt requires input.promptId");
  const prompts = await storage.getBrandPromptsByBrandId(run.brandId, { status: "all" });
  const prompt = prompts.find((p) => p.id === input.promptId);
  if (!prompt) throw new Error(`Prompt ${input.promptId} not found on brand ${run.brandId}`);
  return { brand, prompt };
}

function extractOutputDataField(task: AgentTask, key: string): unknown {
  const data = (task.outputData ?? {}) as Record<string, unknown>;
  return data[key];
}

export const winAPromptWorkflow: WorkflowDefinition = {
  key: "win_a_prompt",
  name: "Win a Prompt",
  description:
    "Baseline check, gap analysis, content brief with approval, article generation, and outreach.",
  triggerType: "manual",
  steps: [
    {
      key: "baseline_citation",
      label: "Baseline citation check",
      description:
        "Run the tracked prompt across AI platforms to establish current citation state.",
      taskType: "prompt_test",
      requiresApproval: false,
      buildInput: (ctx: WorkflowStepContext) => {
        const input = (ctx.run.input as WinAPromptInput | null) ?? ({} as WinAPromptInput);
        return { promptIds: [input.promptId] };
      },
      extractOutput: (task: AgentTask) => {
        const data = (task.outputData ?? {}) as Record<string, unknown>;
        return {
          ranks: data.rankings,
          cited: data.isCited,
          totalCited: data.totalCited,
          citationContexts: data.citationContexts,
        };
      },
    },
    {
      key: "gap_analysis",
      label: "Gap analysis",
      description: "Identify top cited pages and missing angles for this prompt.",
      taskType: "source_analysis",
      requiresApproval: false,
      buildInput: (ctx: WorkflowStepContext) => {
        const input = (ctx.run.input as WinAPromptInput | null) ?? ({} as WinAPromptInput);
        return { mode: "prompt", promptId: input.promptId, limit: 10 };
      },
      extractOutput: (task: AgentTask) => task.outputData ?? {},
    },
    {
      key: "content_brief",
      label: "Content brief",
      description: "Draft a content brief from the gap analysis for approval.",
      requiresApproval: true,
      buildInput: () => ({}),
      extractOutput: () => ({}),
      run: async (ctx: WorkflowStepContext) => {
        const { brand, prompt } = await loadRunContext(ctx.run);
        const gap = (ctx.priorOutputs.gap_analysis as Record<string, unknown> | undefined) ?? {};
        const missingAngles = (gap.missingAngles as string[] | undefined) ?? [];
        const topPages = (gap.topPages as Array<Record<string, unknown>> | undefined) ?? [];
        // When there's no prior citation data (new brand, never-run prompt),
        // synthesize a starter brief from brand + prompt rather than failing.
        // User can edit angles in the approval dialog before generation.
        const fallbackAngles =
          missingAngles.length > 0
            ? missingAngles
            : [
                `Direct answer: ${prompt.prompt}`,
                `${brand.name}'s perspective`,
                `Comparison vs common alternatives`,
                `Concrete examples and numbers`,
              ];
        const brief = {
          title: `How ${brand.name} Answers: ${prompt.prompt}`,
          targetQuery: prompt.prompt,
          keyAngles: fallbackAngles,
          competitorPages: topPages.slice(0, 3),
          tone: "professional",
          length: 1800,
          firstRun: missingAngles.length === 0 && topPages.length === 0,
        };
        return { brief, brandName: brand.name };
      },
      buildApprovalSummary: (ctx: WorkflowStepContext) => {
        const stepOut =
          (ctx.priorOutputs.content_brief as Record<string, unknown> | undefined) ?? {};
        const brief = (stepOut.brief as Record<string, unknown> | undefined) ?? {};
        const input = (ctx.run.input as WinAPromptInput | null) ?? ({} as WinAPromptInput);
        return {
          kind: "brief" as const,
          brief: {
            promptId: input.promptId,
            title: brief.title ?? "",
            targetQuery: brief.targetQuery ?? "",
            keyAngles: (brief.keyAngles as string[] | undefined) ?? [],
            competitorPages:
              (brief.competitorPages as Array<Record<string, unknown>> | undefined) ?? [],
            tone: brief.tone ?? "professional",
            length: brief.length ?? 1800,
            firstRun: brief.firstRun ?? false,
          },
        };
      },
    },
    {
      key: "generate_article",
      label: "Generate article",
      description: "Write the article from the approved brief.",
      taskType: "content_generation",
      requiresApproval: false,
      buildInput: (ctx: WorkflowStepContext) => {
        const briefWrap =
          (ctx.priorOutputs.content_brief as Record<string, unknown> | undefined) ?? {};
        const brief = (briefWrap.brief as Record<string, unknown> | undefined) ?? {};
        const title = (brief.title as string) ?? "Untitled";
        const targetQuery = (brief.targetQuery as string) ?? "";
        const keyAngles = (brief.keyAngles as string[] | undefined) ?? [];
        const tone = (brief.tone as string) ?? "professional";
        return {
          title,
          keywords: [targetQuery, ...keyAngles].filter(Boolean).join(", "),
          contentType: "article",
          contentStyle: tone,
          geography: "",
          keyAngles,
        };
      },
      extractOutput: (task: AgentTask) => ({
        jobId: extractOutputDataField(task, "jobId"),
        articleId: extractOutputDataField(task, "articleId"),
      }),
    },
    {
      key: "await_article_job",
      label: "Wait for article job",
      description: "Poll content_generation_jobs until the article is actually written.",
      requiresApproval: false,
      awaitJob: true,
      getJobId: (priorOutputs) => {
        const gen = (priorOutputs.generate_article as Record<string, unknown> | undefined) ?? {};
        const j = gen.jobId;
        return typeof j === "string" && j.length > 0 ? j : null;
      },
      buildInput: () => ({}),
      extractOutput: () => ({}),
    },
    {
      key: "outreach_discovery",
      label: "Outreach discovery",
      description: "Find listicles ranking for this prompt to pitch inclusion.",
      taskType: "source_analysis",
      requiresApproval: true,
      buildInput: (ctx: WorkflowStepContext) => {
        const input = (ctx.run.input as WinAPromptInput | null) ?? ({} as WinAPromptInput);
        return { mode: "listicles_for_prompt", promptId: input.promptId, limit: 10 };
      },
      extractOutput: (task: AgentTask) => {
        const data = (task.outputData ?? {}) as Record<string, unknown>;
        const listicles = (data.listicles as Listicle[] | undefined) ?? [];
        return {
          listicles,
          empty: Boolean(data.empty),
          reason: data.reason,
        };
      },
      buildApprovalSummary: (ctx: WorkflowStepContext) => {
        const out =
          (ctx.priorOutputs.outreach_discovery as Record<string, unknown> | undefined) ?? {};
        const listicles = (out.listicles as Listicle[] | undefined) ?? [];
        return {
          kind: "listicles" as const,
          listicles: listicles.map((l) => ({
            id: l.id,
            domain: l.domain,
            title: l.title,
            url: l.url,
            hasEmail: typeof l.email === "string" && l.email.length > 0,
          })),
          warning: listicles.every((l) => !l.email)
            ? "None of the discovered listicles have a contact email. The outreach step will skip them. Populate emails on these listicles (Publication Targets) or cancel this run."
            : undefined,
        };
      },
    },
    {
      key: "outreach_drafts",
      label: "Outreach drafts",
      description: "Draft pitch emails for the selected listicles in parallel.",
      taskType: "outreach",
      requiresApproval: false,
      parallel: true,
      onPartialFailure: "continue",
      buildInput: (ctx: WorkflowStepContext) => {
        const out =
          (ctx.priorOutputs.outreach_discovery as Record<string, unknown> | undefined) ?? {};
        if (out.empty === true) return [];
        const listicles = (out.listicles as Listicle[] | undefined) ?? [];
        // Respect the user's approval selection if provided; otherwise default
        // to all discovered listicles.
        const selectedIds = Array.isArray(out.selectedListicleIds)
          ? new Set(
              (out.selectedListicleIds as unknown[]).filter(
                (x): x is string => typeof x === "string",
              ),
            )
          : null;
        const filtered = selectedIds
          ? listicles.filter((l) => l.id && selectedIds.has(l.id))
          : listicles;
        // Skip listicles without a contact email — the outreach handler throws
        // "recipientEmail required" without one, which would waste LLM calls
        // and fail every parallel task.
        const pitchable = filtered.filter((l) => typeof l.email === "string" && l.email.length > 0);
        const briefOut =
          (ctx.priorOutputs.content_brief as Record<string, unknown> | undefined) ?? {};
        const brandName = (briefOut.brandName as string) || "our brand";
        return pitchable.map((l) => ({
          targetDomain: l.domain,
          recipientEmail: l.email as string,
          pitchAngle: `Include ${brandName} in your list: ${l.title}`,
          emailType: "initial" as const,
          publicationTargetId: l.id || null,
        }));
      },
      extractOutput: (task: AgentTask) => {
        const data = (task.outputData ?? {}) as Record<string, unknown>;
        return {
          emailId: data.emailId,
          targetDomain: (task.inputData as Record<string, unknown> | null)?.targetDomain,
        };
      },
    },
  ],
};
