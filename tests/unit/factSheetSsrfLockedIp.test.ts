import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We mock dns/promises and global fetch so this test never hits the network.
vi.mock("dns/promises", () => ({
  default: {
    lookup: vi.fn(),
  },
}));

import dns from "dns/promises";
import { safeFetchTextWithLockedIp } from "../../server/lib/ssrf";

describe("safeFetchTextWithLockedIp", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects URLs whose host resolves to a private IP", async () => {
    (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: "10.0.0.5", family: 4 },
    ]);
    await expect(safeFetchTextWithLockedIp("https://internal.example.com/x")).rejects.toThrow(
      /private/i,
    );
  });

  it("fetches the original URL after upfront SSRF validation", async () => {
    (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response("hi", { status: 200, headers: { "content-type": "text/html" } }),
      );
    global.fetch = fetchSpy as unknown as typeof fetch;

    const out = await safeFetchTextWithLockedIp("https://example.com/about");
    expect(out.status).toBe(200);
    expect(out.text).toBe("hi");
    // We no longer rewrite the URL to the IP — that broke TLS SNI / cert
    // verification. The original hostname is preserved so the TLS stack
    // can validate the cert chain. The SSRF guarantee comes from the
    // upfront assertSafeUrl resolve+validate, not from IP pinning.
    const callUrl = fetchSpy.mock.calls[0][0];
    expect(String(callUrl)).toContain("example.com");
    expect(String(callUrl)).not.toContain("93.184.216.34");
  });

  it("rejects URLs whose host resolves to IPv6 loopback", async () => {
    (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: "::1", family: 6 },
    ]);
    await expect(safeFetchTextWithLockedIp("https://localhost-ish.example.com")).rejects.toThrow();
  });

  it("re-validates the host on each redirect hop", async () => {
    // First hop: example.com resolves public. Second hop (redirect target
    // www.example.com): also public.
    (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "https://www.example.com/landing" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("ok", { status: 200, headers: { "content-type": "text/html" } }),
      );
    global.fetch = fetchSpy as unknown as typeof fetch;

    const out = await safeFetchTextWithLockedIp("https://example.com");
    expect(out.status).toBe(200);
    expect(out.text).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1][0])).toContain("www.example.com");
  });

  it("blocks redirects to private IPs", async () => {
    // example.com → public. Redirect target internal.example.com → 10.x.
    (dns.lookup as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    const fetchSpy = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://internal.example.com/admin" },
      }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(safeFetchTextWithLockedIp("https://example.com")).rejects.toThrow(/private/i);
  });
});
