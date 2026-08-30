import { describe, it, expect, vi } from "vitest";

// classifyAiEnqueueError is a pure function, but it lives in
// server/lib/llmJobs.ts alongside enqueueLlmJob/pollLlmJob, which construct
// an OpenAI client and import the real db pool at module load time. Mock
// those out (same pattern as tests/unit/llmJobsOutbox.test.ts) so importing
// the module here doesn't need OPENAI_API_KEY, DATABASE_URL, or a live
// database - this test never calls anything but the pure classifier.
vi.mock("openai", () => ({
  default: class FakeOpenAI {
    responses = { create: vi.fn(), retrieve: vi.fn() };
  },
}));
vi.mock("../../server/db", () => ({ db: { transaction: vi.fn(), select: vi.fn() } }));
vi.mock("../../server/lib/aiLogger", () => ({ attachAiLogger: vi.fn() }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("../../server/outbox/contentCostOutboxDrain", () => ({
  runContentCostOutboxDrain: vi.fn(),
}));

const { classifyAiEnqueueError } = await import("../../server/lib/llmJobs");

// B7-06 consolidation: server/routes/content.ts (keyword discovery) and
// server/routes/contentTypes.ts (FAQ generation) each caught errors from
// enqueueLlmJob() with their own copy of this 429/401 mapping. The two
// copies were NOT fully identical - content.ts had an extra AbortError/
// TimeoutError branch contentTypes.ts lacked - so only the genuinely
// shared 429/401/default-null classification was consolidated here; each
// route keeps its own remaining branches around the call.
describe("classifyAiEnqueueError", () => {
  it("maps a 429 to a 429 'AI is busy' response", () => {
    expect(classifyAiEnqueueError({ status: 429 })).toEqual({
      status: 429,
      body: {
        success: false,
        error: "AI is busy right now. Please wait a moment and try again.",
      },
    });
  });

  it("maps a 401 to a 503 'misconfigured' response", () => {
    expect(classifyAiEnqueueError({ status: 401 })).toEqual({
      status: 503,
      body: { success: false, error: "AI service is misconfigured. Contact support." },
    });
  });

  it("returns null for an unrecognized status, leaving the caller's default in charge", () => {
    expect(classifyAiEnqueueError({ status: 500 })).toBeNull();
    expect(classifyAiEnqueueError({ name: "AbortError" })).toBeNull();
    expect(classifyAiEnqueueError(undefined)).toBeNull();
    expect(classifyAiEnqueueError(new Error("boom"))).toBeNull();
  });
});
