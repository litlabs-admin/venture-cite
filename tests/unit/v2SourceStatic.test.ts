import { describe, it, expect, vi } from "vitest";
import { runStaticSource } from "../../server/lib/factAgent/v2/sourceStatic";

describe("runStaticSource", () => {
  function makeArgs(overrides: Record<string, unknown> = {}) {
    return {
      url: "https://example.com/about",
      brandUrl: "https://example.com",
      brandName: "Acme",
      industry: "saas",
      runId: "run-1",
      fetcher: vi.fn().mockResolvedValue({
        status: 200,
        text: "<html><head><title>Acme</title><meta name=description content='We build AI'></head></html>",
        contentType: "text/html",
        headers: {},
      }),
      llm: vi.fn().mockResolvedValue(
        JSON.stringify({
          facts: [
            {
              domain: "identity",
              subcategory: "description",
              factKey: "tagline",
              factValue: "We build AI",
              valueType: "string",
              confidence: 0.9,
              sourceExcerpt: "We build AI",
            },
          ],
        }),
      ),
      robotsCache: { isAllowed: vi.fn().mockResolvedValue(true), raw: () => null },
      ...overrides,
    };
  }

  it("returns done + facts on a happy-path 200", async () => {
    const args = makeArgs();
    const out = await runStaticSource(args as never);
    expect(out.status).toBe("done");
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0].factKey).toBe("tagline");
    expect(out.diagnostics.hasStructuredData).toBe(true);
  });

  it("skips with non_html when content-type is binary", async () => {
    const args = makeArgs({
      fetcher: vi.fn().mockResolvedValue({
        status: 200,
        text: "%PDF-1.5",
        contentType: "application/pdf",
        headers: {},
      }),
    });
    const out = await runStaticSource(args as never);
    expect(out.status).toBe("skipped_non_html");
    expect(args.llm).not.toHaveBeenCalled();
  });

  it("skips with wafBlocked on 403 + cf-ray", async () => {
    const args = makeArgs({
      fetcher: vi.fn().mockResolvedValue({
        status: 403,
        text: "<html>Just a moment...</html>",
        contentType: "text/html",
        headers: { "cf-ray": "abc" },
      }),
    });
    const out = await runStaticSource(args as never);
    expect(out.status).toBe("skipped_waf");
    expect(args.llm).not.toHaveBeenCalled();
  });

  it("skips with hollow_shell on a body-empty no-hydration page", async () => {
    const args = makeArgs({
      fetcher: vi.fn().mockResolvedValue({
        status: 200,
        text: "<html><body><div id=app></div></body></html>",
        contentType: "text/html",
        headers: {},
      }),
    });
    const out = await runStaticSource(args as never);
    expect(out.status).toBe("skipped_hollow_shell");
    expect(args.llm).not.toHaveBeenCalled();
  });

  it("skips with robots_disallowed when robots blocks the URL", async () => {
    const args = makeArgs({
      robotsCache: { isAllowed: vi.fn().mockResolvedValue(false), raw: () => null },
    });
    const out = await runStaticSource(args as never);
    expect(out.status).toBe("skipped_robots");
    expect(args.fetcher).not.toHaveBeenCalled();
  });

  it("returns canonical_redirect when canonical differs", async () => {
    const args = makeArgs({
      fetcher: vi.fn().mockResolvedValue({
        status: 200,
        text: `<html><head><title>X</title><link rel="canonical" href="https://example.com/different"></head></html>`,
        contentType: "text/html",
        headers: {},
      }),
      url: "https://example.com/about",
    });
    const out = await runStaticSource(args as never);
    expect(out.status).toBe("skipped_canonical");
    expect(out.canonicalRedirect).toBe("https://example.com/different");
  });
});
