// Unit tests for resolveGroundingRedirects: mocks the HEAD request so no
// network call happens. Mirrors the fetch-stub pattern used elsewhere (see
// tests/unit/bufferConnect.test.ts) - vi.stubGlobal("fetch", ...).
//
// The resolver keeps a module-level cache keyed by the full redirect URL, so
// every test below uses ITS OWN unique token - reusing a token across tests
// would silently serve a stale cached result instead of exercising the
// fetch stub the test just configured.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchStub = vi.fn();
vi.stubGlobal("fetch", fetchStub);

import { resolveGroundingRedirects } from "../../server/lib/groundingRedirect";

function redirectUrl(token: string): string {
  return `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${token}`;
}

function headResponse(status: number, location?: string) {
  return {
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "location" ? (location ?? null) : null),
    },
  };
}

beforeEach(() => {
  fetchStub.mockReset();
});

describe("resolveGroundingRedirects", () => {
  it("resolves a 302 with a Location header to the real URL", async () => {
    const url = redirectUrl("resolve-302");
    fetchStub.mockImplementation(async (u: string) => {
      if (u === url) return headResponse(302, "https://jiveprdigital.com/top-7-pr-agencies/");
      throw new Error(`unexpected fetch: ${u}`);
    });

    const out = await resolveGroundingRedirects([url]);
    expect(out).toEqual(["https://jiveprdigital.com/top-7-pr-agencies/"]);
  });

  it("drops a redirect URL that 404s (expired token)", async () => {
    const url = redirectUrl("expired-404");
    fetchStub.mockResolvedValueOnce(headResponse(404));
    const out = await resolveGroundingRedirects([url]);
    expect(out).toEqual([]);
  });

  it("drops a redirect URL whose HEAD request times out", async () => {
    const url = redirectUrl("timeout");
    fetchStub.mockImplementation((_u: string, opts: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const out = await resolveGroundingRedirects([url]);
    expect(out).toEqual([]);
  }, 10_000);

  it("drops a redirect that resolves to an unsafe private-IP Location", async () => {
    const url = redirectUrl("unsafe-private-ip");
    fetchStub.mockResolvedValueOnce(headResponse(302, "http://127.0.0.1/steal"));
    const out = await resolveGroundingRedirects([url]);
    expect(out).toEqual([]);
  });

  it("drops a redirect that resolves to a non-http(s) scheme Location", async () => {
    const url = redirectUrl("unsafe-file-scheme");
    fetchStub.mockResolvedValueOnce(headResponse(302, "file:///etc/passwd"));
    const out = await resolveGroundingRedirects([url]);
    expect(out).toEqual([]);
  });

  it("passes non-redirect URLs through unchanged and in order", async () => {
    const urls = ["https://example.com/a", "https://example.com/b"];
    const out = await resolveGroundingRedirects(urls);
    expect(out).toEqual(urls);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("dedupes output when multiple tokens resolve to the same page, keeping first-seen order", async () => {
    const urlA = redirectUrl("dedupe-a");
    const urlB = redirectUrl("dedupe-b");
    fetchStub.mockImplementation(async (u: string) => {
      if (u === urlA || u === urlB) return headResponse(302, "https://example.com/same-page");
      throw new Error(`unexpected fetch: ${u}`);
    });

    const out = await resolveGroundingRedirects(["https://leading.example.com/", urlA, urlB]);
    expect(out).toEqual(["https://leading.example.com/", "https://example.com/same-page"]);
  });

  it("caches results so a repeated URL costs no second request", async () => {
    const url = redirectUrl("cache-positive");
    fetchStub.mockResolvedValueOnce(headResponse(302, "https://example.com/cached-target"));

    const first = await resolveGroundingRedirects([url]);
    expect(first).toEqual(["https://example.com/cached-target"]);
    expect(fetchStub).toHaveBeenCalledTimes(1);

    const second = await resolveGroundingRedirects([url]);
    expect(second).toEqual(["https://example.com/cached-target"]);
    // No new fetch call - served from cache.
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("caches a negative (dropped) result too", async () => {
    const url = redirectUrl("cache-negative");
    fetchStub.mockResolvedValueOnce(headResponse(404));

    const first = await resolveGroundingRedirects([url]);
    expect(first).toEqual([]);
    expect(fetchStub).toHaveBeenCalledTimes(1);

    const second = await resolveGroundingRedirects([url]);
    expect(second).toEqual([]);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
