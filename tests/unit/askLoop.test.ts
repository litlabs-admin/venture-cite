// Tests server/ask/loop.ts against a scripted ModelClient - zero HTTP, zero
// provider cost, zero database (docs/ask-feature/07-integration-and-
// hardening.md §7, "the fake model"). Exercises the loop's own control
// flow: tool dispatch, parallel calls, step events, degradation on a
// failed tool, abort mid-run, and the iteration/tool-call/wall-clock caps.
import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { Brand } from "../../shared/schema";

// server/ask/loop.ts statically imports the full tool registry
// (server/ask/tools/registry.ts), which in turn imports server/db.ts -
// even though this file never calls a real tool (every test below passes
// toolsOverride), that import chain still executes at module load and
// server/db.ts throws immediately without DATABASE_URL. A dummy value is
// enough: pg.Pool construction is lazy and never actually connects unless a
// query runs, which toolsOverride guarantees never happens here.
//
// server/ask/modelClient.ts separately imports server/lib/routesShared.ts
// for its cheapCompletion() OpenAI client, which constructs a real `OpenAI`
// client at module load and throws without an API key present - same
// story, a dummy value is enough since ScriptedModelClient (used
// throughout this file) never calls the real client.
//
// Both set BEFORE the dynamic imports below, since static imports would be
// hoisted above any same-file assignment.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";

const { runAskLoop } = await import("../../server/ask/loop");
const { ScriptedModelClient } = await import("../../server/ask/modelClient");

// Local, loose structural types for test purposes - types are erased at
// runtime, so this file doesn't need the exact generic shape from
// server/ask/tools/types.ts, only enough structure for its own fixtures.
type AskToolContext = {
  userId: string;
  brandId: string;
  brand: Brand;
  signal: AbortSignal;
  getReadPageAllowlist: () => Promise<ReadonlySet<string>>;
  incrementPagesRead: () => void;
  memo: {
    get<T>(key: string, compute: () => Promise<T>): Promise<T>;
    seed<T>(key: string, value: T): void;
  };
};
type AskTool<I = any, O = any> = {
  name: string;
  label: string;
  category: string;
  description: string;
  input: z.ZodType<I>;
  costHint: "cheap" | "network";
  run: (
    ctx: AskToolContext,
    input: I,
  ) => Promise<{
    data: O;
    summary: string;
    status: "ok" | "failed";
  }>;
};
type AskEvent = Record<string, unknown> & { type: string };

const FAKE_BRAND = {
  id: "brand-1",
  userId: "user-1",
  name: "Acme",
  companyName: "Acme Inc",
  industry: "SaaS",
  website: "https://acme.com",
} as unknown as Brand;

function baseInput(overrides: Partial<Parameters<typeof runAskLoop>[0]> = {}) {
  const events: AskEvent[] = [];
  const controller = new AbortController();
  return {
    events,
    controller,
    input: {
      brand: FAKE_BRAND,
      userId: "user-1",
      threadId: "thread-1",
      messageId: "message-1",
      userMessage: "why has our visibility moved?",
      systemPrompt: "You are Ask.",
      coreCompetitors: [],
      trackedPromptIds: [],
      history: [],
      signal: controller.signal,
      onEvent: (e: AskEvent) => events.push(e),
      ...overrides,
    },
  };
}

function makeTool(name: string, run: AskTool["run"]): Map<string, AskTool<any, any>> {
  const tool: AskTool<any, any> = {
    name,
    label: `Doing ${name}`,
    category: "test",
    description: "test tool",
    input: z.object({}).passthrough(),
    costHint: "cheap",
    run,
  };
  return new Map([[name, tool]]);
}

describe("runAskLoop", () => {
  it("dispatches a tool call, feeds the result back, and streams the final text", async () => {
    const { events, controller, input } = baseInput();
    void controller;

    const tools = makeTool("get_visibility", async (_ctx: AskToolContext) => ({
      data: { visibilityScore: 42 },
      summary: "Visibility: 42/100",
      status: "ok" as const,
    }));

    const model = new ScriptedModelClient([
      {
        kind: "tool_calls",
        calls: [{ id: "call_1", name: "get_visibility", arguments: {} }],
        usage: { inputTokens: 100, outputTokens: 20 },
      },
      {
        kind: "text",
        text: "Your visibility is 42/100.",
        usage: { inputTokens: 150, outputTokens: 30 },
      },
    ]);

    const result = await runAskLoop({ ...input, model, toolsOverride: tools });

    expect(result.runStatus).toBe("ok");
    expect(result.text).toBe("Your visibility is 42/100.");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].toolName).toBe("get_visibility");
    expect(result.steps[0].status).toBe("ok");
    expect(result.inputTokens).toBe(250);
    expect(result.outputTokens).toBe(50);

    const types = events.map((e) => e.type);
    expect(types).toContain("step_started");
    expect(types).toContain("step_result");
    expect(types).toContain("text_delta");
    // Neither "run_started" nor "done" come from the loop itself - the
    // ROUTE (server/routes/ask.ts) emits run_started once before calling
    // runAskLoop, and done after persisting the result. The loop only
    // emits the events that happen DURING a turn.
    expect(types).not.toContain("run_started");
    expect(types).not.toContain("done");
  });

  it("emits text_reset when the model streams lead-in text before deciding to call a tool", async () => {
    const { events, input } = baseInput();

    const tools = makeTool("get_visibility", async () => ({
      data: { visibilityScore: 42 },
      summary: "Visibility: 42/100",
      status: "ok" as const,
    }));

    const model = new ScriptedModelClient([
      {
        kind: "tool_calls",
        leadInText: "Let me check that...",
        calls: [{ id: "call_1", name: "get_visibility", arguments: {} }],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
      {
        kind: "text",
        text: "Your visibility is 42/100.",
        usage: { inputTokens: 20, outputTokens: 10 },
      },
    ]);

    const result = await runAskLoop({ ...input, model, toolsOverride: tools });

    expect(result.runStatus).toBe("ok");
    expect(result.text).toBe("Your visibility is 42/100.");

    // The lead-in text streamed out as a text_delta BEFORE the tool_calls
    // turn resolved, then text_reset told the client to discard it - both
    // events must be present, and in that order, ahead of the step events
    // for the tool the model went on to call.
    const textDeltaIndex = events.findIndex((e) => e.type === "text_delta");
    const textResetIndex = events.findIndex((e) => e.type === "text_reset");
    const stepStartedIndex = events.findIndex((e) => e.type === "step_started");
    expect(textDeltaIndex).toBeGreaterThanOrEqual(0);
    expect(textResetIndex).toBeGreaterThan(textDeltaIndex);
    expect(stepStartedIndex).toBeGreaterThan(textResetIndex);
    expect(events[textDeltaIndex]).toMatchObject({ content: "Let me check that..." });

    // Exactly one text_reset for this one lead-in turn - the second
    // (genuinely final) turn never streamed a reset of its own.
    expect(events.filter((e) => e.type === "text_reset")).toHaveLength(1);
  });

  it("never emits text_reset when a turn resolves to tool_calls with no lead-in text", async () => {
    const { events, input } = baseInput();
    const tools = makeTool("get_visibility", async () => ({
      data: {},
      summary: "ok",
      status: "ok" as const,
    }));
    const model = new ScriptedModelClient([
      {
        kind: "tool_calls",
        calls: [{ id: "call_1", name: "get_visibility", arguments: {} }],
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      { kind: "text", text: "done", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    await runAskLoop({ ...input, model, toolsOverride: tools });

    expect(events.some((e) => e.type === "text_reset")).toBe(false);
  });

  it("marks the run degraded when a tool fails, and surfaces the reason", async () => {
    const { events, input } = baseInput();

    const tools = makeTool("get_visibility", async () => ({
      data: { error: "db down" },
      summary: "get_visibility failed: db down",
      status: "failed" as const,
    }));

    const model = new ScriptedModelClient([
      {
        kind: "tool_calls",
        calls: [{ id: "call_1", name: "get_visibility", arguments: {} }],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
      {
        kind: "text",
        text: "I could not check visibility.",
        usage: { inputTokens: 20, outputTokens: 10 },
      },
    ]);

    const result = await runAskLoop({ ...input, model, toolsOverride: tools });

    expect(result.runStatus).toBe("degraded");
    expect(result.degradedReasons).toHaveLength(1);
    expect(result.degradedReasons[0]).toContain("db down");

    const stepResult = events.find((e) => e.type === "step_result");
    expect(stepResult && stepResult.type === "step_result" && stepResult.status).toBe("failed");
  });

  it("dispatches multiple tool calls from one turn in parallel", async () => {
    const { input } = baseInput();
    const order: string[] = [];

    const tools = new Map<string, AskTool<any, any>>();
    for (const name of ["tool_a", "tool_b"]) {
      tools.set(name, {
        name,
        label: name,
        category: "test",
        description: "test",
        input: z.object({}).passthrough(),
        costHint: "cheap",
        run: async () => {
          order.push(`start:${name}`);
          await new Promise((r) => setTimeout(r, 5));
          order.push(`end:${name}`);
          return { data: {}, summary: name, status: "ok" as const };
        },
      });
    }

    const model = new ScriptedModelClient([
      {
        kind: "tool_calls",
        calls: [
          { id: "call_1", name: "tool_a", arguments: {} },
          { id: "call_2", name: "tool_b", arguments: {} },
        ],
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      { kind: "text", text: "done", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    await runAskLoop({ ...input, model, toolsOverride: tools });

    // Parallel dispatch: both starts happen before either end.
    expect(order.slice(0, 2).sort()).toEqual(["start:tool_a", "start:tool_b"]);
  });

  it("stops and marks the run 'stopped' when the signal is aborted mid-run", async () => {
    const { input, controller } = baseInput();

    const tools = makeTool("slow_tool", async (ctx: AskToolContext) => {
      // Abort partway through the tool call, mirroring a client disconnect.
      controller.abort();
      return { data: {}, summary: "slow", status: "ok" as const };
    });

    const model = new ScriptedModelClient([
      {
        kind: "tool_calls",
        calls: [{ id: "call_1", name: "slow_tool", arguments: {} }],
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      { kind: "text", text: "should not be reached", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const result = await runAskLoop({ ...input, model, toolsOverride: tools });

    expect(result.runStatus).toBe("stopped");
    expect(result.text).toBe("");
  });

  it("truncates after the iteration cap and still returns an answer", async () => {
    const { input } = baseInput();

    const tools = makeTool("loop_tool", async () => ({
      data: {},
      summary: "again",
      status: "ok" as const,
    }));

    // Script far more tool-call turns than ASK_MAX_ITERATIONS (8) so the cap
    // fires before the script runs out.
    const script = Array.from({ length: 20 }, (_, i) => ({
      kind: "tool_calls" as const,
      calls: [{ id: `call_${i}`, name: "loop_tool", arguments: {} }],
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    const model = new ScriptedModelClient(script);

    const result = await runAskLoop({ ...input, model, toolsOverride: tools });

    expect(result.truncated).toBe(true);
    expect(result.runStatus).toBe("ok");
    // One final tool-free call still produces an answer (04 §3.2) - the
    // stub returns "" past the end of its script, which is a valid answer,
    // not a crash.
    expect(typeof result.text).toBe("string");
  });

  it("handles an unknown tool name from the model without crashing the run", async () => {
    const { events, input } = baseInput();
    const tools = makeTool("known_tool", async () => ({
      data: {},
      summary: "ok",
      status: "ok" as const,
    }));

    const model = new ScriptedModelClient([
      {
        kind: "tool_calls",
        calls: [{ id: "call_1", name: "totally_made_up_tool", arguments: {} }],
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      { kind: "text", text: "answer anyway", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const result = await runAskLoop({ ...input, model, toolsOverride: tools });

    expect(result.runStatus).toBe("degraded");
    expect(result.text).toBe("answer anyway");
    const failed = events.find((e) => e.type === "step_result" && e.status === "failed");
    expect(failed).toBeTruthy();
  });

  it("rejects tool arguments that fail the tool's own Zod schema", async () => {
    const { input } = baseInput();
    const tools = makeTool("strict_tool", async () => ({
      data: {},
      summary: "should not run",
      status: "ok" as const,
    }));
    // Override the schema to require a field the model will never supply.
    (tools.get("strict_tool") as any).input = z.object({ requiredField: z.string() });

    const model = new ScriptedModelClient([
      {
        kind: "tool_calls",
        calls: [{ id: "call_1", name: "strict_tool", arguments: {} }],
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      { kind: "text", text: "ok", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const result = await runAskLoop({ ...input, model, toolsOverride: tools });

    expect(result.steps[0].status).toBe("failed");
    expect(result.runStatus).toBe("degraded");
  });

  it("computes the read-page allowlist lazily, at most once, only when a tool actually asks for it", async () => {
    const { input } = baseInput();
    const seenAllowlists: ReadonlySet<string>[] = [];
    const readPageStandIn = makeTool("read_page_stand_in", async (ctx: AskToolContext) => {
      // Not the real read_page tool (that needs live network + ssrf.ts) -
      // this exercises the same ctx.getReadPageAllowlist() contract every
      // real tool.run() sees.
      seenAllowlists.push(await ctx.getReadPageAllowlist());
      return { data: {}, summary: "ok", status: "ok" as const };
    });

    const model = new ScriptedModelClient([
      {
        kind: "tool_calls",
        // Two calls in the SAME turn, both asking for the allowlist - the
        // memo must collapse this to one computation, not two.
        calls: [
          { id: "call_1", name: "read_page_stand_in", arguments: {} },
          { id: "call_2", name: "read_page_stand_in", arguments: {} },
        ],
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      { kind: "text", text: "done", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    await runAskLoop({ ...input, model, toolsOverride: readPageStandIn });

    // Both tool calls read it, but the memo computed the underlying Set
    // only once: the two resolved allowlists are the exact same instance,
    // not two separately-built ones.
    expect(seenAllowlists).toHaveLength(2);
    expect(seenAllowlists[0]).toBe(seenAllowlists[1]);
  });

  it("never touches the read-page allowlist when no tool calls read_page", async () => {
    const { input } = baseInput();
    // A brand with no website and no competitors/prompts would make
    // buildReadPageAllowlist a no-op anyway, but the point of this test is
    // that it is never even INVOKED - get_visibility never calls
    // ctx.getReadPageAllowlist(), so nothing here should throw even though
    // this run's toolsOverride has no read_page tool registered at all.
    const tools = makeTool("get_visibility", async () => ({
      data: { visibilityScore: 10 },
      summary: "Visibility: 10/100",
      status: "ok" as const,
    }));
    const model = new ScriptedModelClient([
      {
        kind: "tool_calls",
        calls: [{ id: "call_1", name: "get_visibility", arguments: {} }],
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      { kind: "text", text: "done", usage: { inputTokens: 0, outputTokens: 0 } },
    ]);

    const result = await runAskLoop({ ...input, model, toolsOverride: tools });
    expect(result.runStatus).toBe("ok");
  });
});
