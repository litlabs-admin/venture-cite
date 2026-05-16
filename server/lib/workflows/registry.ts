import type { WorkflowDefinition } from "../workflowEngine";
import { weeklyCatchupWorkflow } from "./weeklyCatchup";

export const ALL_WORKFLOWS: WorkflowDefinition[] = [weeklyCatchupWorkflow];

export function workflowByKey(key: string): WorkflowDefinition | undefined {
  return ALL_WORKFLOWS.find((w) => w.key === key);
}
