// ModelClient abstraction (04-implementation-plan.md §3.2,
// 07-integration-and-hardening.md §7 "the fake model"). Two implementations:
// a real OpenRouter-backed one, and a scripted stub with zero provider cost
// used by every loop/protocol test. The loop (server/ask/loop.ts) depends
// only on this interface, never on the OpenAI SDK directly.
//
// Streams for real. This used to call the model NON-STREAMING and, once it
// had the complete final text, re-chunk it into paced text_delta events -
// deliberately, on the reasoning that deciding "tool calls vs. final
// answer" was simpler against a complete response. That simplicity cost a
// full model generation's latency before the client saw a single answer
// token, on top of an already slow per-run setup (server/routes/ask.ts).
// Streaming removes that: `turn()` now forwards real content deltas through
// `onTextDelta` as they arrive and only decides tool_calls-vs-text once the
// stream ends, by which point either the tool-call deltas (accumulated by
// `index`, the documented OpenAI streaming shape) or the full text is
// already assembled. `signal` is threaded through so Stop actually cancels
// the in-flight request instead of only stopping local bookkeeping.
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { getOpenRouterClient } from "../lib/openrouterClient";
import { openai as directOpenAiClient } from "../lib/routesShared";
import { MODELS } from "../lib/modelConfig";

export type ModelRole = "system" | "user" | "assistant" | "tool";

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ModelToolCall[] }
  | { role: "tool"; content: string; toolCallId: string; name: string };

export type ModelToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ModelToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ModelTurn =
  | { kind: "tool_calls"; calls: ModelToolCall[]; usage: ModelUsage }
  | { kind: "text"; text: string; usage: ModelUsage };

export type ModelUsage = { inputTokens: number; outputTokens: number };

export type ModelTurnOptions = {
  /** Aborts the in-flight request (Stop). */
  signal?: AbortSignal;
  /** Called with each content fragment as it streams in. Only ever carries
   *  real prose - never called for a turn that resolves to tool_calls,
   *  UNLESS the model emitted some lead-in text before deciding to call a
   *  tool, in which case the loop (loop.ts) sends a `text_reset` event to
   *  tell the client to discard what it already rendered. */
  onTextDelta?: (delta: string) => void;
};

export interface ModelClient {
  /** One turn, streamed. Resolves once the stream ends, with either the
   *  tool calls the model wants to make or its final text - `onTextDelta`
   *  (if given) already saw every content fragment as it arrived. Never
   *  throws for a normal model response - only for a transport/provider
   *  failure or abort, which the loop treats as a run error/stop. */
  turn(
    messages: ModelMessage[],
    tools: ModelToolDefinition[],
    opts?: ModelTurnOptions,
  ): Promise<ModelTurn>;
  /** A small, cheap call for follow-up generation - no tools, capped output. */
  cheapCompletion(prompt: string, maxTokens: number): Promise<string>;
}

function toOpenAiMessages(messages: ModelMessage[]): any[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", content: m.content, tool_call_id: m.toolCallId, name: m.name };
    }
    if (m.role === "assistant") {
      return {
        role: "assistant",
        content: m.content,
        ...(m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            }
          : {}),
      };
    }
    return { role: m.role, content: m.content };
  });
}

export class OpenRouterModelClient implements ModelClient {
  constructor(private readonly model: string = MODELS.ask) {}

  async turn(
    messages: ModelMessage[],
    tools: ModelToolDefinition[],
    opts?: ModelTurnOptions,
  ): Promise<ModelTurn> {
    const client = getOpenRouterClient();
    // `stream: true` must stay a literal on a properly-typed params object -
    // casting the whole params object to `any` (as the old non-streaming
    // call did) defeats the SDK's overload resolution and silently picks
    // the NON-streaming `create()` overload, whose return type has no
    // `[Symbol.asyncIterator]` to iterate below.
    const params: ChatCompletionCreateParamsStreaming = {
      model: this.model,
      messages: toOpenAiMessages(messages) as any,
      tools: tools.length > 0 ? (tools as any) : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      temperature: 0.3,
      max_tokens: 2000,
      stream: true,
      // Usage otherwise never arrives on a streamed response - it's the
      // documented opt-in for a final chunk carrying prompt/completion
      // token counts alongside the empty `choices: []` that ends the
      // stream.
      stream_options: { include_usage: true },
    };
    const stream = await client.chat.completions.create(params, { signal: opts?.signal });

    let text = "";
    let usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
    // Tool-call deltas arrive fragmented and keyed by `index` (the
    // documented OpenAI streaming shape) - name and id typically land on
    // the first fragment for that index, `arguments` accumulates as a JSON
    // string across many fragments after that.
    const callsByIndex = new Map<number, { id: string; name: string; argsChunks: string[] }>();

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        text += delta.content;
        opts?.onTextDelta?.(delta.content);
      }
      for (const tc of delta?.tool_calls ?? []) {
        const idx: number = tc.index ?? 0;
        const entry = callsByIndex.get(idx) ?? { id: "", name: "", argsChunks: [] };
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name = tc.function.name;
        if (tc.function?.arguments) entry.argsChunks.push(tc.function.arguments);
        callsByIndex.set(idx, entry);
      }
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }

    if (callsByIndex.size > 0) {
      const calls: ModelToolCall[] = Array.from(callsByIndex.entries())
        .sort(([a], [b]) => a - b)
        .map(([, entry]) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(entry.argsChunks.join("") || "{}");
          } catch {
            args = {};
          }
          return { id: entry.id, name: entry.name, arguments: args };
        });
      return { kind: "tool_calls", calls, usage };
    }

    return { kind: "text", text, usage };
  }

  async cheapCompletion(prompt: string, maxTokens: number): Promise<string> {
    // MODELS.askFollowups is an OPENAI_MINI_SNAPSHOT model, called through
    // the DIRECT OpenAI client - matching every other OPENAI_MINI_SNAPSHOT
    // call site in this codebase (see modelConfig.ts's header comment: only
    // the three ANALYSIS_MODEL features go through OpenRouter). MODELS.ask
    // itself stays on OpenRouter via turn() above.
    const response = await directOpenAiClient.chat.completions.create({
      model: MODELS.askFollowups,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: maxTokens,
    });
    return response.choices?.[0]?.message?.content ?? "";
  }
}

// ---- Scripted stub for tests (07 §7). Zero provider cost, deterministic. ----

// `leadInText`, only meaningful on a `kind: "tool_calls"` entry, scripts a
// real turn's rarer shape: the model streams some prose (a line like "Let
// me check...") before the stream resolves to tool_calls. Real streaming
// (modelClient.ts's OpenRouterModelClient) can produce exactly this, and
// loop.ts's `text_reset` handling exists specifically for it - without this
// field a scripted turn could only ever be cleanly "text" or cleanly
// "tool_calls", and that code path would go untested.
export type ScriptedTurn = ModelTurn & { leadInText?: string };

export class ScriptedModelClient implements ModelClient {
  private cursor = 0;
  constructor(
    private readonly script: ScriptedTurn[],
    private readonly cheapReply: string = "",
  ) {}

  async turn(
    _messages: ModelMessage[],
    _tools: ModelToolDefinition[],
    opts?: ModelTurnOptions,
  ): Promise<ModelTurn> {
    if (this.cursor >= this.script.length) {
      return { kind: "text", text: "", usage: { inputTokens: 0, outputTokens: 0 } };
    }
    const { leadInText, ...turn } = this.script[this.cursor++];
    // Exercises the same onTextDelta path a real streamed turn takes - one
    // delta carrying the whole scripted text, which is enough for a test to
    // assert the loop forwards it, without needing to fake real chunking.
    if (turn.kind === "text" && turn.text.length > 0) {
      opts?.onTextDelta?.(turn.text);
    } else if (leadInText) {
      opts?.onTextDelta?.(leadInText);
    }
    return turn;
  }

  async cheapCompletion(): Promise<string> {
    return this.cheapReply;
  }
}
