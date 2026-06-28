import { describe, it, expect } from "vitest";
import { classifyServiceKey } from "../server/lib/supabaseKey";

// Build a fake JWT (header.payload.sig) carrying a given role claim.
const jwt = (payload: object) =>
  ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");

describe("classifyServiceKey", () => {
  it("accepts a legacy service_role JWT", () => {
    expect(classifyServiceKey(jwt({ role: "service_role" })).kind).toBe("privileged");
  });

  it("accepts a new-style secret key", () => {
    expect(classifyServiceKey("sb_secret_abc123").kind).toBe("privileged");
  });

  it("rejects an anon-role JWT — the exact misconfig behind the storage RLS 403", () => {
    expect(classifyServiceKey(jwt({ role: "anon" })).kind).toBe("rejected");
  });

  it("rejects a publishable key", () => {
    expect(classifyServiceKey("sb_publishable_abc").kind).toBe("rejected");
  });

  it("warns (unknown) — never blocks boot — on an unrecognized format", () => {
    expect(classifyServiceKey("not-a-key").kind).toBe("unknown");
    expect(classifyServiceKey(jwt({ sub: "x" })).kind).toBe("unknown");
  });
});
