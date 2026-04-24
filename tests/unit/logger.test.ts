import { describe, it, expect } from "vitest";
import { sanitizeLogBody } from "../../server/lib/logger";

describe("sanitizeLogBody", () => {
  it("returns primitives unchanged", () => {
    expect(sanitizeLogBody(null)).toBeNull();
    expect(sanitizeLogBody(undefined)).toBeUndefined();
    expect(sanitizeLogBody(42)).toBe(42);
    expect(sanitizeLogBody(true)).toBe(true);
  });

  it("truncates long strings to 200 chars + ellipsis", () => {
    const long = "x".repeat(500);
    const out = sanitizeLogBody(long) as string;
    expect(out.length).toBe(198); // 197 + ellipsis char
    expect(out.endsWith("…")).toBe(true);
  });

  it("leaves short strings alone", () => {
    expect(sanitizeLogBody("hello")).toBe("hello");
  });

  it("redacts password / token / apiKey fields", () => {
    const out = sanitizeLogBody({
      email: "x@y.z",
      password: "supersecret",
      token: "jwt.token.here",
      access_token: "atok",
      refresh_token: "rtok",
      apiKey: "sk-abc",
      api_key: "sk-xyz",
      authorization: "Bearer ...",
      secret: "shh",
      passwordHash: "$2b$...",
    }) as Record<string, string>;

    expect(out.email).toBe("x@y.z");
    expect(out.password).toBe("[redacted]");
    expect(out.token).toBe("[redacted]");
    expect(out.access_token).toBe("[redacted]");
    expect(out.refresh_token).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
    expect(out.api_key).toBe("[redacted]");
    expect(out.authorization).toBe("[redacted]");
    expect(out.secret).toBe("[redacted]");
    expect(out.passwordHash).toBe("[redacted]");
  });

  it("redacts deeply-nested sensitive fields", () => {
    const out = sanitizeLogBody({
      user: { profile: { password: "p", email: "e@x.com" } },
    }) as { user: { profile: Record<string, string> } };
    expect(out.user.profile.password).toBe("[redacted]");
    expect(out.user.profile.email).toBe("e@x.com");
  });

  it("caps array length to 10 entries", () => {
    const arr = Array.from({ length: 25 }, (_, i) => i);
    const out = sanitizeLogBody(arr) as number[];
    expect(out.length).toBe(10);
    expect(out[9]).toBe(9);
  });

  it("caps recursion depth at 3 levels", () => {
    const deep: Record<string, unknown> = { a: { b: { c: { d: { e: "leaf" } } } } };
    const out = sanitizeLogBody(deep) as Record<string, unknown>;
    // Depth: top is depth 0; a→1; a.b→2; a.b.c→3; a.b.c.d → depth>3 ⇒ truncated
    expect((((out.a as any).b as any).c as any).d).toBe("[truncated]");
  });

  it("handles empty objects and arrays", () => {
    expect(sanitizeLogBody({})).toEqual({});
    expect(sanitizeLogBody([])).toEqual([]);
  });

  it("preserves non-sensitive nested structures within depth limit", () => {
    const input = {
      brand: { id: "b1", name: "Acme" },
    };
    const out = sanitizeLogBody(input) as typeof input;
    expect(out.brand.id).toBe("b1");
    expect(out.brand.name).toBe("Acme");
  });
});
