import type { WorkflowDefinition } from "../workflowEngine";
import { winAPromptWorkflow } from "./winAPrompt";
import { weeklyCatchupWorkflow } from "./weeklyCatchup";
import { fixLosingArticleWorkflow } from "./fixLosingArticle";

export const ALL_WORKFLOWS: WorkflowDefinition[] = [
  winAPromptWorkflow,
  weeklyCatchupWorkflow,
  fixLosingArticleWorkflow,
];

export function workflowByKey(key: string): WorkflowDefinition | undefined {
  return ALL_WORKFLOWS.find((w) => w.key === key);
}
