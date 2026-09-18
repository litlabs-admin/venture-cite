// propose_action - the ONLY write tool (04-implementation-plan.md §2.3: "No
// tool may write directly. Writes go through propose_action only.").
//
// Structural validation (07-integration-and-hardening.md §6.1) happens in
// ACTION_KIND_DEFS[kind].validate() BEFORE any agent_tasks row is created:
// every parameter must trace to a database row or the user's own message
// text, never to fetched page text. A rejected proposal returns a tool
// result the model sees (so it can tell the user why), but creates nothing.
import { z } from "zod";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { ACTION_KINDS } from "@shared/ask/actions";
import { ACTION_KIND_DEFS } from "../actions/kinds";
import type { AskBlock } from "@shared/ask/blocks";
import type { AskTool, AskToolContext, AskToolResult } from "./types";
import { runToolSafely } from "./types";

const inputSchema = z.object({
  kind: z.enum(ACTION_KINDS),
  // Kind-specific parameters, e.g. { promptId } for track_prompt. Validated
  // structurally against the database - see kinds.ts.
  params: z.record(z.string(), z.unknown()).default({}),
  // Model-authored, second person, references the user's actual question -
  // the field that makes the card persuasive rather than bureaucratic (see
  // 01-trakkr-teardown.md R11's observed example).
  rationale: z.string().min(1).max(2000),
});
type Input = z.infer<typeof inputSchema>;

type Output = {
  proposed: boolean;
  taskId?: string;
  reason?: string;
};

// propose_action needs the thread/message it is attached to (so the card can
// be linked back) and the user's current message (a structural-validation
// source for future kinds) - fields no other tool needs. Rather than widen
// every tool's context for one tool, this factory closes over the extra
// fields and returns a normal AskTool the registry can call like any other.
export function createProposeActionTool(extra: {
  threadId: string;
  messageId: string;
  userMessage: string;
}): AskTool<Input, Output> {
  return {
    name: "propose_action",
    label: "Preparing suggestion",
    category: "suggestion",
    description:
      "Proposes a concrete action for the user to approve or dismiss - e.g. tracking a new prompt, re-running a citation check, or remembering a durable fact about the brand (kind='remember_fact', params={type, content}) that should inform every future answer. This does NOT execute anything; it creates a card the user must approve first. Only call remember_fact for something worth keeping permanently - a stated constraint, a named audience, a point of difference, a brand fact, or a topic to track - never for a one-off detail that only matters to this answer.",
    input: inputSchema,
    costHint: "cheap",
    async run(ctx: AskToolContext, input: Input): Promise<AskToolResult<Output>> {
      return runToolSafely<Output>("propose_action", async () => {
        const def = ACTION_KIND_DEFS[input.kind];
        const validated = await def.validate(
          { brandId: ctx.brandId, userMessage: extra.userMessage },
          input.params,
        );

        if (!validated.ok) {
          return {
            data: { proposed: false, reason: validated.reason },
            summary: `Not proposed: ${validated.reason}`,
            status: "ok",
          };
        }

        const [task] = await db
          .insert(schema.agentTasks)
          .values({
            brandId: ctx.brandId,
            taskType: input.kind,
            taskTitle: validated.title,
            taskDescription: input.rationale,
            priority: "medium",
            status: "proposed",
            assignedTo: "agent",
            triggeredBy: "chained", // originates from an Ask run, not a direct user click or cron
            inputData: validated.params,
            askThreadId: extra.threadId,
            askMessageId: extra.messageId,
            proposedAt: new Date(),
            metadata: { inputEcho: validated.inputEcho },
          })
          .returning();

        const block: AskBlock = {
          kind: "stat_row",
          items: [{ label: def.kindLabel, value: validated.title }],
        };

        return {
          data: { proposed: true, taskId: task.id },
          summary: `Proposed: ${validated.title}`,
          status: "ok",
          block,
        };
      });
    },
  };
}
