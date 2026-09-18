// The agent loop (04-implementation-plan.md §3.2). server/lib/
// agentTaskExecutor.ts is a durable TASK RUNNER, not an agent - it has one
// hardcoded handler (prompt_test) and no model in the loop at all. THIS file
// is the actual tool-calling loop: it is the one place in the codebase where
// a model chooses its own next step. Do not import express here (enforced
// by eslint.config.js's no-restricted-imports for server/ask/**) - the loop
// must stay testable against a scripted ModelClient with zero HTTP and zero
// provider cost (07-integration-and-hardening.md §7).
import { randomUUID } from "node:crypto";
import type { Brand } from "@shared/schema";
import type { AskBlock, EvidenceItem } from "@shared/ask/blocks";
import type { AskActionCard } from "@shared/ask/actions";
import type { AskEvent } from "@shared/ask/events";
import {
  ASK_MAX_ITERATIONS,
  ASK_MAX_TOOL_CALLS,
  ASK_MAX_WALL_CLOCK_MS,
  ASK_TOOL_MAX_JSON_BYTES,
} from "@shared/ask/constants";
import type { ModelClient, ModelMessage } from "./modelClient";
import { buildToolRegistry, toolDefinitionsForModel } from "./tools/registry";
import { RunMemo } from "./tools/types";
import { toActionCard } from "./actions/execute";
import { buildReadPageAllowlist, type AskRunContext } from "./context";
import { db } from "../db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";

export type LoopStepRecord = {
  ordinal: number;
  toolName: string;
  label: string;
  category: string;
  summary: string;
  durationMs: number;
  status: "ok" | "failed";
};

export type LoopResult = {
  text: string;
  blocks: AskBlock[];
  evidence: EvidenceItem[];
  actionCards: AskActionCard[];
  steps: LoopStepRecord[];
  suggestions: string[];
  pagesRead: number;
  inputTokens: number;
  outputTokens: number;
  runStatus: "ok" | "degraded" | "stopped" | "error";
  degradedReasons: string[];
  truncated: boolean;
  durationMs: number;
};

export type RunAskLoopInput = {
  brand: Brand;
  userId: string;
  threadId: string;
  messageId: string; // the (not-yet-persisted) assistant message id this run is producing
  userMessage: string;
  systemPrompt: string;
  coreCompetitors: AskRunContext["coreCompetitors"];
  trackedPromptIds: AskRunContext["trackedPromptIds"];
  // Optional: assembleAskContext (server/ask/context.ts) already computed
  // this once, for the "# Current measurement state" prompt layer - seeded
  // into the run's memo (RunMemo) so get_visibility reuses it instead of
  // querying the same all-time hero again. Omitted by every unit test,
  // which pass their own scripted tool results instead.
  hero?: AskRunContext["hero"];
  history: ModelMessage[]; // prior thread turns, oldest first
  model: ModelClient;
  signal: AbortSignal;
  onEvent: (event: AskEvent) => void;
  // Test-only injection point (07-integration-and-hardening.md §7, "the fake
  // model"): when provided, used INSTEAD of buildToolRegistry(...). Lets a
  // unit test exercise the loop's own control flow - iteration caps,
  // parallel dispatch, degradation, abort - with zero database and zero
  // provider cost. Production call sites (server/routes/ask.ts) never pass
  // this; the real registry is always built from live tools.
  toolsOverride?: Map<string, import("./tools/types").AskTool<any, any>>;
};

function truncateJson(value: unknown, maxBytes: number): string {
  const full = JSON.stringify(value);
  if (Buffer.byteLength(full, "utf8") <= maxBytes) return full;
  // Cheap truncation: cut the string and note it. Good enough for a
  // model-facing payload, which only needs to know its result was capped -
  // exact byte-boundary correctness doesn't matter here.
  return (
    full.slice(0, maxBytes) + `..."[truncated, ${Buffer.byteLength(full, "utf8")} bytes total]`
  );
}

export async function runAskLoop(input: RunAskLoopInput): Promise<LoopResult> {
  const startedAt = Date.now();
  const result: LoopResult = {
    text: "",
    blocks: [],
    evidence: [],
    actionCards: [],
    steps: [],
    suggestions: [],
    pagesRead: 0,
    inputTokens: 0,
    outputTokens: 0,
    runStatus: "ok",
    degradedReasons: [],
    truncated: false,
    durationMs: 0,
  };

  const tools =
    input.toolsOverride ??
    buildToolRegistry({
      threadId: input.threadId,
      messageId: input.messageId,
      userMessage: input.userMessage,
    });
  const toolDefs = toolDefinitionsForModel(tools);

  const messages: ModelMessage[] = [
    { role: "system", content: input.systemPrompt },
    ...input.history,
    { role: "user", content: input.userMessage },
  ];

  let pagesReadCount = 0;
  const incrementPagesRead = () => {
    pagesReadCount += 1;
  };

  // One memo per run (tools/types.ts's RunMemo) - seeded with whatever
  // assembleAskContext already paid for, so get_visibility reusing the
  // hero or list_competitors reusing the core-competitor list is a cache
  // hit, not a second round trip. getReadPageAllowlist is itself just
  // another memoized entry: nothing computes it until a tool actually
  // calls read_page.
  const memo = new RunMemo();
  if (input.hero) memo.seed("hero", input.hero);
  memo.seed("coreCompetitors", input.coreCompetitors);
  const getReadPageAllowlist = () =>
    memo.get("readPageAllowlist", () =>
      buildReadPageAllowlist(input.brand, input.coreCompetitors, input.trackedPromptIds),
    );

  let totalToolCalls = 0;
  let iteration = 0;
  let finished = false;

  try {
    while (!finished) {
      if (input.signal.aborted) {
        result.runStatus = "stopped";
        break;
      }

      const elapsed = Date.now() - startedAt;
      const overLimit =
        iteration >= ASK_MAX_ITERATIONS ||
        totalToolCalls >= ASK_MAX_TOOL_CALLS ||
        elapsed >= ASK_MAX_WALL_CLOCK_MS;

      iteration += 1;

      if (overLimit) {
        result.truncated = true;
        // One final tool-free call so the user always gets an answer
        // (04 §3.2). No tools offered -> the model cannot request more work,
        // so it must resolve to text - streamed live via onTextDelta, same
        // as the normal path below.
        input.onEvent({ type: "status", verb: "Writing", object: "final answer" });
        const turn = await input.model.turn(messages, [], {
          signal: input.signal,
          onTextDelta: (delta) => input.onEvent({ type: "text_delta", content: delta }),
        });
        result.inputTokens += turn.usage.inputTokens;
        result.outputTokens += turn.usage.outputTokens;
        result.text = turn.kind === "text" ? turn.text : "";
        finished = true;
        break;
      }

      // Status BEFORE the model call, not after - this is the fix for the
      // observed blank 5-10s gap (docs/ask-feature UI review): the model
      // call below is the slowest step in the whole turn, and previously
      // nothing was emitted until it resolved. First pass reads as
      // "Thinking through your question"; every pass after a tool round
      // reads as "Reviewing what it found", since by then the model is
      // deciding what to do with tool results already on the table.
      input.onEvent({
        type: "status",
        verb: iteration === 1 ? "Thinking" : "Reviewing",
        object: iteration === 1 ? "your question" : "what it found",
      });
      // `textStreamedThisTurn` tracks whether the model emitted any content
      // BEFORE the stream resolved to tool_calls (some models lead with a
      // line like "Let me check..." before calling a tool). Those deltas
      // already reached the client the moment they streamed - the loop only
      // learns the turn's final kind once the stream ends - so if this
      // turn ends in tool_calls after emitting text, a text_reset event
      // tells the client to discard what it already rendered rather than
      // showing dangling lead-in prose above the step trace.
      let textStreamedThisTurn = false;
      const turn = await input.model.turn(messages, toolDefs, {
        signal: input.signal,
        onTextDelta: (delta) => {
          textStreamedThisTurn = true;
          input.onEvent({ type: "text_delta", content: delta });
        },
      });
      result.inputTokens += turn.usage.inputTokens;
      result.outputTokens += turn.usage.outputTokens;

      if (input.signal.aborted) {
        result.runStatus = "stopped";
        break;
      }

      if (turn.kind === "text") {
        result.text = turn.text;
        finished = true;
        break;
      }

      // tool_calls: append the assistant's tool-call turn, dispatch every
      // call in parallel (Trakkr's own tool phase was ~1.4s of a 56s+ run -
      // 01-trakkr-teardown.md §2.3 - so parallel dispatch is cheap and worth
      // having from the start), then continue the loop.
      if (textStreamedThisTurn) {
        input.onEvent({ type: "text_reset" });
      }
      messages.push({ role: "assistant", content: null, toolCalls: turn.calls });
      input.onEvent({ type: "status", verb: "Checking", object: "your data" });

      const dispatched = await Promise.all(
        turn.calls.map(async (call) => {
          const ordinal = result.steps.length;
          const stepId = randomUUID();
          const tool = tools.get(call.name);
          const t0 = Date.now();

          if (!tool) {
            input.onEvent({
              type: "step_started",
              stepId,
              ordinal,
              label: call.name,
              category: "unknown",
            });
            const durationMs = Date.now() - t0;
            input.onEvent({
              type: "step_result",
              stepId,
              summary: `Unknown tool: ${call.name}`,
              durationMs,
              status: "failed",
            });
            result.steps.push({
              ordinal,
              toolName: call.name,
              label: call.name,
              category: "unknown",
              summary: `Unknown tool: ${call.name}`,
              durationMs,
              status: "failed",
            });
            result.degradedReasons.push(`Unknown tool: ${call.name}`);
            return {
              toolCallId: call.id,
              toolName: call.name,
              content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
            };
          }

          input.onEvent({
            type: "step_started",
            stepId,
            ordinal,
            label: tool.label,
            category: tool.category,
          });

          const parsedInput = tool.input.safeParse(call.arguments);
          if (!parsedInput.success) {
            const durationMs = Date.now() - t0;
            const summary = `Invalid arguments for ${call.name}`;
            input.onEvent({ type: "step_result", stepId, summary, durationMs, status: "failed" });
            result.steps.push({
              ordinal,
              toolName: call.name,
              label: tool.label,
              category: tool.category,
              summary,
              durationMs,
              status: "failed",
            });
            result.degradedReasons.push(summary);
            return {
              toolCallId: call.id,
              toolName: call.name,
              content: JSON.stringify({ error: "Invalid arguments" }),
            };
          }

          const toolResult = await tool.run(
            {
              userId: input.userId,
              brandId: input.brand.id,
              brand: input.brand,
              signal: input.signal,
              getReadPageAllowlist,
              incrementPagesRead,
              memo,
            },
            parsedInput.data,
          );
          const durationMs = Date.now() - t0;

          input.onEvent({
            type: "step_result",
            stepId,
            summary: toolResult.summary,
            durationMs,
            status: toolResult.status,
          });
          result.steps.push({
            ordinal,
            toolName: call.name,
            label: tool.label,
            category: tool.category,
            summary: toolResult.summary,
            durationMs,
            status: toolResult.status,
          });
          if (toolResult.status === "failed") {
            result.degradedReasons.push(toolResult.summary);
          }
          if (toolResult.block) {
            result.blocks.push(toolResult.block);
            input.onEvent({ type: "block", block: toolResult.block });
          }
          if (toolResult.evidence && toolResult.evidence.length > 0) {
            result.evidence.push(...toolResult.evidence);
            input.onEvent({ type: "evidence", items: toolResult.evidence });
          }

          // propose_action is the one tool whose success produces a card the
          // client must see immediately, not just a text summary.
          if (call.name === "propose_action") {
            const data = toolResult.data as { proposed?: boolean; taskId?: string };
            if (data.proposed && data.taskId) {
              try {
                const [task] = await db
                  .select()
                  .from(schema.agentTasks)
                  .where(eq(schema.agentTasks.id, data.taskId))
                  .limit(1);
                if (task) {
                  const card = await toActionCard(task);
                  result.actionCards.push(card);
                  input.onEvent({ type: "action_card", card });
                }
              } catch {
                // Card emission failing must not fail the run - the
                // proposal still exists in the database and will show up
                // next time the thread is loaded.
              }
            }
          }

          return {
            toolCallId: call.id,
            toolName: call.name,
            content: truncateJson(toolResult.data, ASK_TOOL_MAX_JSON_BYTES),
          };
        }),
      );

      totalToolCalls += dispatched.length;
      for (const d of dispatched) {
        messages.push({
          role: "tool",
          content: d.content,
          toolCallId: d.toolCallId,
          name: d.toolName,
        });
      }
    }
  } catch (err) {
    result.runStatus = "error";
    result.degradedReasons.push(err instanceof Error ? err.message : String(err));
  }

  result.pagesRead = pagesReadCount;
  result.durationMs = Date.now() - startedAt;
  if (result.runStatus === "ok" && result.degradedReasons.length > 0) {
    result.runStatus = "degraded";
  }

  return result;
}
