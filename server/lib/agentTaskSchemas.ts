// Zod schemas for agent_tasks.inputData per taskType. The /execute handler
// parses task.inputData against the matching schema before running the
// switch, so missing/misnamed fields fail loudly instead of being read as
// undefined and cascading into weak defaults.
import { z } from "zod";

export const contentGenerationInputSchema = z
  .object({
    keywords: z.string().optional(),
    industry: z.string().optional(),
    type: z.string().optional(),
    humanize: z.boolean().optional(),
    targetCustomers: z.string().optional(),
    geography: z.string().optional(),
    contentStyle: z.string().optional(),
  })
  .passthrough();

export const outreachInputSchema = z
  .object({
    targetDomain: z.string().optional(),
    recipientEmail: z.string().email().optional(),
    contactEmail: z.string().email().optional(),
    recipientName: z.string().nullable().optional(),
    campaignId: z.string().nullable().optional(),
    publicationTargetId: z.string().nullable().optional(),
    pitchAngle: z.string().optional(),
    emailType: z.enum(["initial", "follow_up", "reply"]).optional(),
  })
  .passthrough();

export const promptTestInputSchema = z
  .object({
    promptIds: z.array(z.string()).optional(),
  })
  .passthrough();

export const sourceAnalysisInputSchema = z
  .object({
    limit: z.number().int().positive().max(100).optional(),
    mode: z.enum(["brand", "prompt", "listicles_for_prompt"]).optional().default("brand"),
    promptId: z.string().optional(),
  })
  .passthrough();

export const hallucinationRemediationInputSchema = z
  .object({
    hallucinationId: z.string().min(1, "hallucinationId is required"),
  })
  .passthrough();

export const seoUpdateInputSchema = z
  .object({
    articleId: z.string().min(1, "articleId is required"),
  })
  .passthrough();

// Discriminated by taskType. Caller validates task.inputData against
// SCHEMAS[taskType]; unknown taskTypes should be rejected at the handler
// level, not fall back to a generic LLM call.
export const AGENT_TASK_SCHEMAS = {
  content_generation: contentGenerationInputSchema,
  outreach: outreachInputSchema,
  prompt_test: promptTestInputSchema,
  source_analysis: sourceAnalysisInputSchema,
  hallucination_remediation: hallucinationRemediationInputSchema,
  seo_update: seoUpdateInputSchema,
} as const;

export type AgentTaskType = keyof typeof AGENT_TASK_SCHEMAS;

export function isKnownAgentTaskType(t: string): t is AgentTaskType {
  return t in AGENT_TASK_SCHEMAS;
}

export function parseAgentTaskInput<T extends AgentTaskType>(
  taskType: T,
  input: unknown,
): z.infer<(typeof AGENT_TASK_SCHEMAS)[T]> {
  const schema = AGENT_TASK_SCHEMAS[taskType];
  return schema.parse(input ?? {}) as z.infer<(typeof AGENT_TASK_SCHEMAS)[T]>;
}
