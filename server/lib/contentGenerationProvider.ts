import { z } from "zod";
import { attachAiLogger } from "./aiLogger";
import { LLM_CALL_TIMEOUT_MS } from "./factAgent/v2/vercelBudget";

export type ContentGenerationProviderRequest = {
  model: string;
  input: string;
  background: true;
  store: true;
};

export type ContentGenerationProviderOptions = {
  timeout: number;
  maxRetries: number;
  idempotencyKey?: string;
};

export type ContentGenerationProviderResponse = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "cancelled" | "incomplete";
  output_text?: string;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
};

export interface ContentGenerationProvider {
  create(
    request: ContentGenerationProviderRequest,
    options: ContentGenerationProviderOptions,
  ): Promise<ContentGenerationProviderResponse>;
  retrieve(
    id: string,
    options: ContentGenerationProviderOptions,
  ): Promise<ContentGenerationProviderResponse>;
  cancel(
    id: string,
    options: ContentGenerationProviderOptions,
  ): Promise<ContentGenerationProviderResponse>;
}

const providerResponseSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["queued", "in_progress", "completed", "failed", "cancelled", "incomplete"]),
  output_text: z.string().optional(),
  usage: z
    .object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() })
    .nullable()
    .optional(),
  error: z.object({ message: z.string().optional() }).nullable().optional(),
  incomplete_details: z.object({ reason: z.string().optional() }).nullable().optional(),
});

type FakeResponse = z.infer<typeof providerResponseSchema>;

const fakeResponses = new Map<string, { response: FakeResponse; polls: number; hold: boolean }>();
let fakeResponseNumber = 0;

function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function fakeProviderIsAllowed(env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV === "test") return true;
  return env.NODE_ENV === "development" && isLoopbackUrl(env.CONTENT_GENERATION_FAKE_BASE_URL);
}

function fakeOutput(input: string): string {
  const topic = input.match(/about "([^"]+)"/)?.[1] ?? "the requested topic";
  return [
    `# Local fake article about ${topic}`,
    "",
    "## Summary",
    "",
    "This article came from the deterministic local content provider.",
    "",
    "## Practical guidance",
    "",
    "Use the verified product facts and the requested audience when you review this draft.",
    "",
    "## Frequently asked questions",
    "",
    "### What is this draft?",
    "",
    "It is a local test result.",
    "",
    "### Can a user edit it?",
    "",
    "Yes. The article and its revision are persisted after completion.",
  ].join("\n");
}

function createFakeProvider(): ContentGenerationProvider {
  return {
    async create(request) {
      const id = `fake-content-response-${++fakeResponseNumber}`;
      const hold = request.input.includes("[cancel-local-generation]");
      const response: FakeResponse = {
        id,
        status: "queued",
        output_text: fakeOutput(request.input),
        usage: { input_tokens: 42, output_tokens: 84 },
      };
      fakeResponses.set(id, { response, polls: 0, hold });
      return response;
    },

    async retrieve(id) {
      const state = fakeResponses.get(id);
      if (!state) {
        return { id, status: "failed", error: { message: "Fake response not found" } };
      }
      state.polls += 1;
      if (state.hold) return { ...state.response, status: "in_progress" };
      if (state.polls === 1) return { ...state.response, status: "in_progress" };
      return { ...state.response, status: "completed" };
    },

    async cancel(id) {
      const state = fakeResponses.get(id);
      if (!state) return { id, status: "cancelled" };
      state.response = { ...state.response, status: "cancelled" };
      return state.response;
    },
  };
}

function createOpenAiProvider(): ContentGenerationProvider {
  let clientPromise: Promise<{
    responses: {
      create: (
        request: ContentGenerationProviderRequest,
        options: ContentGenerationProviderOptions,
      ) => Promise<unknown>;
      retrieve: (
        id: string,
        _input: undefined,
        options: ContentGenerationProviderOptions,
      ) => Promise<unknown>;
      cancel: (id: string, options: ContentGenerationProviderOptions) => Promise<unknown>;
    };
  }> | null = null;

  const getClient = async () => {
    clientPromise ??= import("openai").then(({ default: OpenAI }) => {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: LLM_CALL_TIMEOUT_MS,
        maxRetries: 1,
      });
      attachAiLogger(client);
      return client;
    });
    return clientPromise;
  };

  const parseResponse = (value: unknown): ContentGenerationProviderResponse => {
    const parsed = providerResponseSchema.safeParse(value);
    if (!parsed.success) throw new Error("Content provider returned an invalid response");
    return parsed.data;
  };

  return {
    async create(request, options) {
      return parseResponse(
        (await (await getClient()).responses.create(request, options)) as unknown,
      );
    },
    async retrieve(id, options) {
      return parseResponse(
        (await (await getClient()).responses.retrieve(id, undefined, options)) as unknown,
      );
    },
    async cancel(id, options) {
      return parseResponse((await (await getClient()).responses.cancel(id, options)) as unknown);
    },
  };
}

export function createContentGenerationProvider(
  env: NodeJS.ProcessEnv = process.env,
): ContentGenerationProvider {
  const mode = env.CONTENT_GENERATION_PROVIDER ?? "openai";
  if (mode === "openai") return createOpenAiProvider();
  if (mode !== "fake") throw new Error(`Unknown content generation provider: ${mode}`);
  if (!fakeProviderIsAllowed(env)) {
    throw new Error(
      "The fake content generation provider requires NODE_ENV=test or a development loopback base URL",
    );
  }
  return createFakeProvider();
}

export function usesFakeContentGenerationProvider(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CONTENT_GENERATION_PROVIDER === "fake" && fakeProviderIsAllowed(env);
}

export function _resetFakeContentGenerationProviderForTests(): void {
  fakeResponses.clear();
  fakeResponseNumber = 0;
}
