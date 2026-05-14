import { describe, it, expect, vi } from "vitest";
import { createRobotsCache } from "../../server/lib/factAgent/robotsCache";

describe("robotsCache", () => {
  it("fetches robots.txt once and reuses the parse for subsequent isAllowed calls", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      text: "User-agent: *\nDisallow: /admin\n",
      contentType: "text/plain",
    });
    const cache = createRobotsCache("https://example.com", fetcher);
    expect(await cache.isAllowed("https://example.com/about")).toBe(true);
    expect(await cache.isAllowed("https://example.com/admin")).toBe(false);
    expect(await cache.isAllowed("https://example.com/admin/users")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("https://example.com/robots.txt");
  });

  it("treats missing robots.txt (404) as allow-all", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 404, text: "", contentType: "text/html" });
    const cache = createRobotsCache("https://example.com", fetcher);
    expect(await cache.isAllowed("https://example.com/anything")).toBe(true);
  });

  it("treats fetch error as allow-all (fail-open)", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("net down"));
    const cache = createRobotsCache("https://example.com", fetcher);
    expect(await cache.isAllowed("https://example.com/about")).toBe(true);
  });

  it("respects User-agent specific block before wildcard", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      text: "User-agent: VentureCiteBot\nDisallow: /priv\n\nUser-agent: *\nDisallow:\n",
      contentType: "text/plain",
    });
    const cache = createRobotsCache("https://example.com", fetcher);
    expect(await cache.isAllowed("https://example.com/priv/x")).toBe(false);
    expect(await cache.isAllowed("https://example.com/public")).toBe(true);
  });

  it("returns null from raw() when fetch failed", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
    const cache = createRobotsCache("https://example.com", fetcher);
    await cache.isAllowed("https://example.com/x");
    expect(cache.raw()).toBeNull();
  });
});
