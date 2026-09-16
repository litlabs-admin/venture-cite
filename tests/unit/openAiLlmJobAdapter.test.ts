import { describe, expect, it, vi } from "vitest";
import type { ClaimedOutboxCommand } from "../../server/outbox/outboxRepository";
import {
  createOpenAiLlmJobHandler,
  openAiLlmJobIdempotencyKey,
} from "../../server/outbox/openAiLlmJobAdapter";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/lib/aiLogger", () => ({ attachAiLogger: vi.fn() }));

function command(): ClaimedOutboxCommand {
  return {
    id: "command-1",
    kind: "openai.start_llm_job",
    status: "processing",
    idempotencyKey: openAiLlmJobIdempotencyKey("llm-job-1"),
    aggregateType: "llm_job",
    aggregateId: "llm-job-1",
    userId: "user-1",
    brandId: "brand-1",
    payload: { kind: "openai.start_llm_job", llmJobId: "llm-job-1" },
    attemptCount: 1,
    maxAttempts: 25,
    availableAt: new Date("2026-08-20T00:00:00Z"),
    leaseToken: "00000000-0000-4000-8000-000000000001",
    leaseExpiresAt: new Date("2026-08-20T00:02:00Z"),
    providerName: "openai",
    providerOperation: "start_llm_job",
    createdAt: new Date("2026-08-20T00:00:00Z"),
    startedAt: new Date("2026-08-20T00:00:00Z"),
    completedAt: null,
    deadLetteredAt: null,
  };
}

function database(input: {
  status: string;
  responseId: string | null;
  providerRequest: unknown;
  link: "linked" | "lost";
}) {
  let transactionCount = 0;
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      transactionCount += 1;
      const tx = {
        execute: vi.fn(),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () =>
                transactionCount === 1
                  ? [
                      {
                        status: input.status,
                        responseId: input.responseId,
                        providerRequest: input.providerRequest,
                      },
                    ]
                  : [{ status: input.link === "lost" ? "cancelled" : "running", responseId: null }],
            }),
          }),
        }),
        update: () => ({
          set: (values: Record<string, unknown>) => {
            updates.push(values);
            return {
              where: () => ({
                returning: async () => (input.link === "linked" ? [{ id: "llm-job-1" }] : []),
              }),
            };
          },
        }),
      };
      return work(tx);
    },
  };
}

describe("OpenAI LLM job outbox adapter", () => {
  it("uses the job id as the stable provider idempotency key", async () => {
    const client = {
      responses: {
        create: vi.fn().mockResolvedValue({ id: "resp-1" }),
        cancel: vi.fn(),
      },
    };
    const handler = createOpenAiLlmJobHandler(
      database({
        status: "pending",
        responseId: null,
        providerRequest: {
          model: "gpt-test",
          instructions: null,
          input: "hello",
          responseFormat: { type: "json_object" },
        },
        link: "linked",
      }),
      client,
    );

    await expect(
      handler({
        command: command(),
        idempotencyKey: openAiLlmJobIdempotencyKey("llm-job-1"),
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ providerReference: "resp-1" });
    expect(client.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({ background: true, store: true }),
      expect.objectContaining({
        idempotencyKey: "openai-start-llm-job:llm-job-1",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  // The Responses API rejects `text.format: json_object` with a 400 unless the
  // word "json" appears in the input messages; `instructions` does not count.
  // Keyword discovery kept its "Return a JSON object" wording in
  // `instructions` only, so every job died at kickoff as provider_rejected.
  it("adds a json directive when a json_object job's input never says json", async () => {
    const client = {
      responses: { create: vi.fn().mockResolvedValue({ id: "resp-json" }), cancel: vi.fn() },
    };
    const handler = createOpenAiLlmJobHandler(
      database({
        status: "pending",
        responseId: null,
        providerRequest: {
          model: "gpt-test",
          instructions: "Return a JSON object of the shape {}",
          input: "Discover 12-15 keywords for this brand.",
          responseFormat: { type: "json_object" },
        },
        link: "linked",
      }),
      client,
    );

    await handler({
      command: command(),
      idempotencyKey: openAiLlmJobIdempotencyKey("llm-job-1"),
      signal: new AbortController().signal,
    });

    const sent = client.responses.create.mock.calls[0][0] as { input: string };
    expect(sent.input).toMatch(/json/i);
    expect(sent.input).toContain("Discover 12-15 keywords for this brand.");
  });

  it("leaves the input alone when it already says json", async () => {
    const client = {
      responses: { create: vi.fn().mockResolvedValue({ id: "resp-keep" }), cancel: vi.fn() },
    };
    const handler = createOpenAiLlmJobHandler(
      database({
        status: "pending",
        responseId: null,
        providerRequest: {
          model: "gpt-test",
          instructions: null,
          input: "Return the FAQs as a JSON object.",
          responseFormat: { type: "json_object" },
        },
        link: "linked",
      }),
      client,
    );

    await handler({
      command: command(),
      idempotencyKey: openAiLlmJobIdempotencyKey("llm-job-1"),
      signal: new AbortController().signal,
    });

    expect((client.responses.create.mock.calls[0][0] as { input: string }).input).toBe(
      "Return the FAQs as a JSON object.",
    );
  });

  it("leaves a non json_object job's input alone", async () => {
    const client = {
      responses: { create: vi.fn().mockResolvedValue({ id: "resp-text" }), cancel: vi.fn() },
    };
    const handler = createOpenAiLlmJobHandler(
      database({
        status: "pending",
        responseId: null,
        providerRequest: {
          model: "gpt-test",
          instructions: null,
          input: "Write a paragraph.",
          responseFormat: { type: "text" },
        },
        link: "linked",
      }),
      client,
    );

    await handler({
      command: command(),
      idempotencyKey: openAiLlmJobIdempotencyKey("llm-job-1"),
      signal: new AbortController().signal,
    });

    expect((client.responses.create.mock.calls[0][0] as { input: string }).input).toBe(
      "Write a paragraph.",
    );
  });

  it("cancels a provider response when the conditional link loses to cancellation", async () => {
    const client = {
      responses: {
        create: vi.fn().mockResolvedValue({ id: "resp-2" }),
        cancel: vi.fn().mockResolvedValue({ id: "resp-2" }),
      },
    };
    const handler = createOpenAiLlmJobHandler(
      database({
        status: "pending",
        responseId: null,
        providerRequest: {
          model: "gpt-test",
          instructions: null,
          input: "hello",
          responseFormat: null,
        },
        link: "lost",
      }),
      client,
    );

    await expect(
      handler({
        command: command(),
        idempotencyKey: openAiLlmJobIdempotencyKey("llm-job-1"),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ kind: "permanent", code: "cancelled" });
    expect(client.responses.cancel).toHaveBeenCalledWith("resp-2");
  });

  it("marks a permanently rejected job as failed", async () => {
    const client = {
      responses: {
        create: vi.fn().mockRejectedValue({ status: 400 }),
        cancel: vi.fn(),
      },
    };
    const testDatabase = database({
      status: "pending",
      responseId: null,
      providerRequest: {
        model: "gpt-test",
        instructions: null,
        input: "hello",
        responseFormat: null,
      },
      link: "linked",
    });
    const handler = createOpenAiLlmJobHandler(testDatabase, client);

    await expect(
      handler({
        command: command(),
        idempotencyKey: openAiLlmJobIdempotencyKey("llm-job-1"),
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual({ kind: "permanent", code: "provider_rejected" });
    expect(testDatabase.updates).toContainEqual(
      expect.objectContaining({ status: "failed", errorKind: "provider_rejected" }),
    );
  });

  it("marks the job failed after the last transient attempt", async () => {
    const client = {
      responses: {
        create: vi.fn().mockRejectedValue({ status: 503 }),
        cancel: vi.fn(),
      },
    };
    const testDatabase = database({
      status: "pending",
      responseId: null,
      providerRequest: {
        model: "gpt-test",
        instructions: null,
        input: "hello",
        responseFormat: null,
      },
      link: "linked",
    });
    const finalCommand = { ...command(), attemptCount: 25, maxAttempts: 25 };
    const handler = createOpenAiLlmJobHandler(testDatabase, client);

    await expect(
      handler({
        command: finalCommand,
        idempotencyKey: openAiLlmJobIdempotencyKey("llm-job-1"),
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual({ kind: "transient", code: "provider_unavailable" });
    expect(testDatabase.updates).toContainEqual(
      expect.objectContaining({ status: "failed", errorKind: "provider_unavailable" }),
    );
  });
});
