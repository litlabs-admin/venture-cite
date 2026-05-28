import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  delete process.env.FACT_AGENT_JINA_ENABLED;
  delete process.env.JINA_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const { fetchViaJina, isJinaAvailable } =
  await import("../../server/lib/factAgent/v2/jinaFallback");

function plainResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain", ...headers },
  });
}

describe("isJinaAvailable", () => {
  it("returns true by default", () => {
    expect(isJinaAvailable()).toBe(true);
  });
  it("returns false when explicitly disabled", () => {
    process.env.FACT_AGENT_JINA_ENABLED = "false";
    expect(isJinaAvailable()).toBe(false);
  });
});

describe("fetchViaJina", () => {
  it("returns missing_key when disabled", async () => {
    process.env.FACT_AGENT_JINA_ENABLED = "false";
    const out = await fetchViaJina("https://example.com");
    expect(out.ok).toBe(false);
    expect(out.errorKind).toBe("missing_key");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns ok=true with markdown on 200", async () => {
    fetchSpy.mockResolvedValueOnce(
      plainResponse("# Brand\n\nA bunch of useful content goes here.".repeat(5)),
    );
    const out = await fetchViaJina("https://example.com");
    expect(out.ok).toBe(true);
    expect(out.markdown.length).toBeGreaterThan(100);
  });

  it("reports non_2xx errorKind on HTTP error", async () => {
    fetchSpy.mockResolvedValueOnce(plainResponse("rate limited", 429));
    const out = await fetchViaJina("https://example.com");
    expect(out.ok).toBe(false);
    expect(out.errorKind).toBe("non_2xx");
  });

  it("reports empty_body when markdown is too short", async () => {
    fetchSpy.mockResolvedValueOnce(plainResponse("tiny"));
    const out = await fetchViaJina("https://example.com");
    expect(out.ok).toBe(false);
    expect(out.errorKind).toBe("empty_body");
  });

  it("reports fetch_failed on network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ECONNRESET"));
    const out = await fetchViaJina("https://example.com");
    expect(out.ok).toBe(false);
    expect(out.errorKind).toBe("fetch_failed");
  });

  it("uses x-resolved-url header when present", async () => {
    fetchSpy.mockResolvedValueOnce(
      plainResponse("# Brand\n\nA bunch of useful content goes here.".repeat(5), 200, {
        "x-resolved-url": "https://www.example.com/final",
      }),
    );
    const out = await fetchViaJina("https://example.com");
    expect(out.resolvedUrl).toBe("https://www.example.com/final");
  });

  it("sends Authorization header when JINA_API_KEY is set", async () => {
    process.env.JINA_API_KEY = "test-key";
    fetchSpy.mockResolvedValueOnce(
      plainResponse("# Brand\n\nA bunch of useful content.".repeat(5)),
    );
    await fetchViaJina("https://example.com");
    const call = fetchSpy.mock.calls[0];
    const headers = (call[1] as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBe("Bearer test-key");
  });

  it("URL-encodes the target URL in the Jina request", async () => {
    fetchSpy.mockResolvedValueOnce(
      plainResponse("# Brand\n\nA bunch of useful content.".repeat(5)),
    );
    await fetchViaJina("https://example.com/foo bar");
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("r.jina.ai");
    expect(url).toContain("%20"); // space encoded
  });
});
