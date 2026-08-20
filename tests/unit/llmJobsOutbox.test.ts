import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  create: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  returning: vi.fn().mockResolvedValue([{ id: "llm-job-1" }]),
  runDrain: vi.fn().mockResolvedValue({ stopReason: "idle" }),
  waitUntil: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    responses = { create: stubs.create };
  },
}));
vi.mock("../../server/db", () => ({
  db: {
    transaction: stubs.transaction,
  },
}));
vi.mock("../../server/lib/aiLogger", () => ({ attachAiLogger: vi.fn() }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: stubs.waitUntil }));
vi.mock("../../server/outbox/contentCostOutboxDrain", () => ({
  runContentCostOutboxDrain: stubs.runDrain,
}));

const schema = await import("../../shared/schema");
const { enqueueLlmJob, registerLlmJobHandler, _resetLlmJobHandlersForTests } =
  await import("../../server/lib/llmJobs");

beforeEach(() => {
  vi.clearAllMocks();
  _resetLlmJobHandlersForTests();
  stubs.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) =>
    work({
      insert: () => ({
        values: () => ({ returning: stubs.returning }),
      }),
      execute: stubs.execute,
    }),
  );
  registerLlmJobHandler({ kind: "keyword_discovery", finalize: vi.fn() });
});

describe("LLM job outbox enqueue", () => {
  it("returns pending from one owner transaction without calling OpenAI", async () => {
    const result = await enqueueLlmJob({
      kind: "keyword_discovery",
      payload: { brandId: "brand-1" },
      userId: "user-1",
      brandId: "brand-1",
      model: "gpt-test",
      input: "discover keywords",
      responseFormat: { type: "json_object" },
    });

    expect(result).toEqual({ jobId: "llm-job-1", status: "pending" });
    expect(stubs.transaction).toHaveBeenCalledOnce();
    expect(stubs.create).not.toHaveBeenCalled();
    expect(stubs.runDrain).toHaveBeenCalledOnce();
    expect(stubs.waitUntil).toHaveBeenCalledOnce();
    expect(stubs.execute).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(stubs.execute.mock.calls[0]?.[0].queryChunks)).toContain(
      "set local role venturecite_content_request",
    );
    expect(JSON.stringify(stubs.execute.mock.calls[2]?.[0].queryChunks)).toContain(
      "private.enqueue_openai_start_llm_job",
    );
    expect(schema.llmJobs).toBeDefined();
  });
});
