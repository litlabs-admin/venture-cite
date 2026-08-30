// Direct, no-HTTP tests for server/services/cronAuth.ts (B7 service
// extraction). HTTP-level behavior for the cron routes that call this is
// already covered by tests/unit/cronOrchestrator.test.ts and
// tests/unit/cronPublicAuth.test.ts; this file proves the extracted
// function itself works given plain header values, no Express Request.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCronAuthorized } from "../../server/services/cronAuth";

describe("isCronAuthorized", () => {
  const prevSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = prevSecret;
  });

  it("rejects every request when no CRON_SECRET is configured", () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized("Bearer secret", undefined)).toBe(false);
  });

  it("accepts the correct Authorization: Bearer header", () => {
    expect(isCronAuthorized("Bearer secret", undefined)).toBe(true);
  });

  it("rejects the wrong bearer token", () => {
    expect(isCronAuthorized("Bearer wrong", undefined)).toBe(false);
  });

  it("rejects an Authorization header missing the Bearer prefix", () => {
    expect(isCronAuthorized("secret", undefined)).toBe(false);
  });

  it("accepts the x-cron-secret header", () => {
    expect(isCronAuthorized(undefined, "secret")).toBe(true);
  });

  it("rejects the wrong x-cron-secret header", () => {
    expect(isCronAuthorized(undefined, "wrong")).toBe(false);
  });

  it("rejects an x-cron-secret header sent as an array", () => {
    expect(isCronAuthorized(undefined, ["secret"])).toBe(false);
  });

  it("rejects when neither header is present", () => {
    expect(isCronAuthorized(undefined, undefined)).toBe(false);
  });
});
