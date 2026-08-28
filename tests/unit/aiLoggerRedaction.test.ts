import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";

const SECRET = "sk-proj-this-must-not-reach-logs";

function createOpenAiClient(): {
  client: OpenAI;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: "The model response contains no secret." } }],
  });
  const client = {
    chat: { completions: { create } },
  } as unknown as OpenAI;

  return { client, create };
}

describe("attachAiLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("redacts a secret-shaped prompt value from Pino output", async () => {
    vi.stubEnv("AI_LOG_PAYLOADS", "true");
    vi.stubEnv("NODE_ENV", "production");

    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    const { attachAiLogger } = await import("../../server/lib/aiLogger");
    const { client, create } = createOpenAiClient();
    attachAiLogger(client);

    await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: `Use this credential: ${SECRET}` }],
    });

    expect(create).toHaveBeenCalledOnce();
    const loggedOutput = output.join("");
    expect(loggedOutput).toContain("ai request");
    expect(loggedOutput).toContain("[redacted]");
    expect(loggedOutput).not.toContain(SECRET);
  });
});
