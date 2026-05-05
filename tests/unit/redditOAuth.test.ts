import { describe, it, expect, beforeEach, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getRedditAccessToken, _resetRedditTokenCacheForTests } from "../../server/lib/redditOAuth";

describe("getRedditAccessToken", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    _resetRedditTokenCacheForTests();
    process.env.REDDIT_CLIENT_ID = "id";
    process.env.REDDIT_CLIENT_SECRET = "secret";
    process.env.REDDIT_USERNAME = "u";
    process.env.REDDIT_PASSWORD = "p";
  });

  it("requests token then returns cached value within TTL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "tok-1", expires_in: 3600, token_type: "bearer" }),
    });
    const a = await getRedditAccessToken();
    const b = await getRedditAccessToken();
    expect(a).toBe("tok-1");
    expect(b).toBe("tok-1");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes after TTL expiry", async () => {
    vi.useFakeTimers({ now: Date.now() });
    try {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "tok-1", expires_in: 100, token_type: "bearer" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "tok-2", expires_in: 3600, token_type: "bearer" }),
        });
      expect(await getRedditAccessToken()).toBe("tok-1");
      await vi.advanceTimersByTimeAsync(50_000); // 50s; buffered TTL was 40s, so cache now stale
      expect(await getRedditAccessToken()).toBe("tok-2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws when env not configured", async () => {
    delete process.env.REDDIT_CLIENT_ID;
    await expect(getRedditAccessToken()).rejects.toThrow(/REDDIT_CLIENT_ID/);
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "unauthorized" });
    await expect(getRedditAccessToken()).rejects.toThrow(/reddit oauth.*401/i);
  });
});
