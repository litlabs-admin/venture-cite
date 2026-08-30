// Direct, no-HTTP tests for server/services/cronFactVerification.ts (B7
// service extraction). HTTP-level behavior for the orchestrator that calls
// this step is already covered by tests/unit/cronOrchestrator.test.ts;
// this file proves the extracted LLM-callable wiring (message shape,
// response-format default) works when called directly.

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test-key";

const stubs = vi.hoisted(() => ({
  runReverificationBatch: vi.fn(),
  openaiCreate: vi.fn(),
}));

vi.mock("../../server/lib/factAgent/v2/reverifyFact", () => ({
  runReverificationBatch: stubs.runReverificationBatch,
}));

vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { misc: "gpt-4o-mini" },
}));

vi.mock("../../server/lib/factAgent/v2/vercelBudget", () => ({
  LLM_CALL_TIMEOUT_MS: 20_000,
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: stubs.openaiCreate } };
  },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { runFactReverificationBatchStep } =
  await import("../../server/services/cronFactVerification");

beforeEach(() => {
  stubs.runReverificationBatch.mockReset();
  stubs.openaiCreate.mockReset();
});

describe("runFactReverificationBatchStep", () => {
  it("runs the batch bounded to 20 facts with a working LLM callable for a string prompt", async () => {
    stubs.runReverificationBatch.mockImplementation(async (limit: number, llm: any) => {
      expect(limit).toBe(20);
      const answer = await llm("What is the capital of France?");
      expect(answer).toBe("Paris");
      return { attempted: 1, verified: 1, drift: 0, unreachable: 0 };
    });
    stubs.openaiCreate.mockResolvedValue({
      choices: [{ message: { content: "Paris" } }],
    });

    await runFactReverificationBatchStep();

    expect(stubs.runReverificationBatch).toHaveBeenCalledTimes(1);
    const call = stubs.openaiCreate.mock.calls[0][0];
    expect(call.model).toBe("gpt-4o-mini");
    expect(call.messages).toEqual([{ role: "user", content: "What is the capital of France?" }]);
    expect(call.response_format).toEqual({ type: "json_object" });
  });

  it("builds a system+user message pair for a structured prompt", async () => {
    stubs.runReverificationBatch.mockImplementation(async (_limit: number, llm: any) => {
      await llm({ system: "sys", user: "usr" });
      return { attempted: 0, verified: 0, drift: 0, unreachable: 0 };
    });
    stubs.openaiCreate.mockResolvedValue({ choices: [{ message: { content: "{}" } }] });

    await runFactReverificationBatchStep();

    const call = stubs.openaiCreate.mock.calls[0][0];
    expect(call.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
  });

  it("honours an explicit responseFormat on a structured prompt", async () => {
    stubs.runReverificationBatch.mockImplementation(async (_limit: number, llm: any) => {
      await llm({ system: "sys", user: "usr", responseFormat: { type: "text" } });
      return { attempted: 0, verified: 0, drift: 0, unreachable: 0 };
    });
    stubs.openaiCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });

    await runFactReverificationBatchStep();

    const call = stubs.openaiCreate.mock.calls[0][0];
    expect(call.response_format).toEqual({ type: "text" });
  });

  it("returns an empty string when the completion has no content", async () => {
    stubs.runReverificationBatch.mockImplementation(async (_limit: number, llm: any) => {
      const answer = await llm("prompt");
      expect(answer).toBe("");
      return { attempted: 0, verified: 0, drift: 0, unreachable: 0 };
    });
    stubs.openaiCreate.mockResolvedValue({ choices: [] });

    await runFactReverificationBatchStep();
  });
});
