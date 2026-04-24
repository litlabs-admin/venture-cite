import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { authRateKey } from "../../server/lib/authRateKey";

function makeReq(ip: string | undefined, body?: unknown): Request {
  return { ip, body } as unknown as Request;
}

describe("authRateKey", () => {
  it("keys by ip + lowercased email when an email is in the body", () => {
    const key = authRateKey(makeReq("1.2.3.4", { email: "Alice@Example.COM" }));
    expect(key).toBe("1.2.3.4:alice@example.com");
  });

  it("trims whitespace around the email", () => {
    const key = authRateKey(makeReq("1.2.3.4", { email: "  bob@example.com  " }));
    expect(key).toBe("1.2.3.4:bob@example.com");
  });

  it("falls back to ip-only when body is missing", () => {
    const key = authRateKey(makeReq("9.9.9.9"));
    expect(key).toBe("ip:9.9.9.9");
  });

  it("falls back to ip-only when body has no email field", () => {
    const key = authRateKey(makeReq("9.9.9.9", { foo: "bar" }));
    expect(key).toBe("ip:9.9.9.9");
  });

  it("falls back to ip-only when email is non-string", () => {
    const key = authRateKey(makeReq("9.9.9.9", { email: 12345 }));
    expect(key).toBe("ip:9.9.9.9");
  });

  it("uses 'unknown' when ip is missing", () => {
    const key = authRateKey(makeReq(undefined, { email: "x@y.z" }));
    expect(key).toBe("unknown:x@y.z");
  });

  it("two requests from the same IP with different emails get different keys", () => {
    const a = authRateKey(makeReq("1.1.1.1", { email: "alice@example.com" }));
    const b = authRateKey(makeReq("1.1.1.1", { email: "bob@example.com" }));
    expect(a).not.toBe(b);
  });
});
