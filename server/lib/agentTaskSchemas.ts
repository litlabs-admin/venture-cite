// Zod schemas for agent_tasks.inputData per taskType. executeAgentTask parses
// task.inputData against the matching schema before running the handler, so
// missing/misnamed fields fail loudly instead of cascading into weak defaults.
import { z } from "zod";

export const promptTestInputSchema = z
  .object({
    promptIds: z.array(z.string()).optional(),
  })
  .passthrough();

// Discriminated by taskType. Currently only prompt_test is live — queued by
// weeklyCatchupWorkflow's citation_check step.
export const AGENT_TASK_SCHEMAS = {
  prompt_test: promptTestInputSchema,
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
