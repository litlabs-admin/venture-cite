import { describe, it, expect } from "vitest";
import { assertSafeUrl } from "../../server/lib/ssrf";

describe("assertSafeUrl", () => {
  it("accepts a public https URL", async () => {
    const url = await assertSafeUrl("https://example.com/path");
    expect(url.hostname).toBe("example.com");
  });

  it("rejects ftp://", async () => {
    await expect(assertSafeUrl("ftp://example.com")).rejects.toThrow(/http\(s\)/);
  });

  it("rejects javascript: scheme", async () => {
    await expect(assertSafeUrl("javascript:alert(1)")).rejects.toThrow();
  });

  it("rejects literal localhost", async () => {
    await expect(assertSafeUrl("http://localhost/x")).rejects.toThrow(/Private host/);
  });

  it("rejects 127.0.0.1", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/x")).rejects.toThrow(/Private IP/);
  });

  it("rejects AWS metadata service IP (169.254.169.254)", async () => {
    await expect(assertSafeUrl("http://169.254.169.254/")).rejects.toThrow(/Private IP/);
  });

  it("rejects RFC1918 10.x", async () => {
    await expect(assertSafeUrl("http://10.0.0.1/")).rejects.toThrow(/Private IP/);
  });

  it("rejects IPv6 loopback", async () => {
    await expect(assertSafeUrl("http://[::1]/")).rejects.toThrow(/private IP/i);
  });

  it("rejects malformed URL", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toThrow(/Invalid URL/);
  });

  it("rejects URL with empty host", async () => {
    await expect(assertSafeUrl("http:///path")).rejects.toThrow();
  });
});
