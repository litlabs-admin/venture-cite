import { afterEach, describe, expect, it } from "vitest";
import {
  _resetFakeContentGenerationProviderForTests,
  createContentGenerationProvider,
  usesFakeContentGenerationProvider,
  type ContentGenerationProviderRequest,
} from "../../server/lib/contentGenerationProvider";

const request = {
  model: "local-test-model",
  input: 'Write an article about "local testing" for the Software industry.',
  background: true,
  store: true,
} satisfies ContentGenerationProviderRequest;

const options = { timeout: 1000, maxRetries: 0 };

describe("content generation provider boundary", () => {
  afterEach(() => {
    _resetFakeContentGenerationProviderForTests();
  });

  it("allows the fake provider in test mode and completes after polling", async () => {
    const provider = createContentGenerationProvider({
      NODE_ENV: "test",
      CONTENT_GENERATION_PROVIDER: "fake",
    });

    const created = await provider.create(request, options);
    expect(created.status).toBe("queued");

    const firstPoll = await provider.retrieve(created.id, options);
    expect(firstPoll.status).toBe("in_progress");
    const completed = await provider.retrieve(created.id, options);
    expect(completed.status).toBe("completed");
    expect(completed.output_text).toContain("deterministic local content provider");
  });

  it("allows a loopback development base and rejects production or remote bases", () => {
    expect(
      usesFakeContentGenerationProvider({
        NODE_ENV: "development",
        CONTENT_GENERATION_PROVIDER: "fake",
        CONTENT_GENERATION_FAKE_BASE_URL: "http://127.0.0.1:5000",
      }),
    ).toBe(true);
    expect(() =>
      createContentGenerationProvider({
        NODE_ENV: "production",
        CONTENT_GENERATION_PROVIDER: "fake",
        CONTENT_GENERATION_FAKE_BASE_URL: "http://127.0.0.1:5000",
      }),
    ).toThrow("requires NODE_ENV=test");
    expect(() =>
      createContentGenerationProvider({
        NODE_ENV: "development",
        CONTENT_GENERATION_PROVIDER: "fake",
        CONTENT_GENERATION_FAKE_BASE_URL: "https://staging.example.com",
      }),
    ).toThrow("requires NODE_ENV=test");
  });
});
