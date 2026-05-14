import { describe, it, expect } from "vitest";
import { sanitizeHydration } from "../../server/lib/factAgent/v2/hydrationSanitizer";

describe("sanitizeHydration", () => {
  it("removes image URLs", () => {
    const input = `{"hero":"https://cdn.example.com/img.jpg","text":"Acme"}`;
    const out = sanitizeHydration(input);
    expect(out).not.toContain("img.jpg");
    expect(out).toContain("Acme");
  });

  it("removes base64 blobs over 500 chars", () => {
    const blob = "a".repeat(800);
    const input = `{"img":"${blob}","name":"Acme"}`;
    const out = sanitizeHydration(input);
    expect(out).not.toContain(blob);
    expect(out).toContain("Acme");
  });

  it("redacts email patterns", () => {
    const input = `Contact: alice@example.com is the founder`;
    const out = sanitizeHydration(input);
    expect(out).not.toContain("alice@example.com");
    expect(out).toContain("[REDACTED_EMAIL]");
    expect(out).toContain("is the founder");
  });

  it("redacts JWT-shape tokens", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const input = `{"sessionToken":"${jwt}","tagline":"Build fast"}`;
    const out = sanitizeHydration(input);
    expect(out).not.toContain(jwt);
    expect(out).toContain("Build fast");
  });

  it("redacts values for sensitive key names", () => {
    const input = `{"userId":"u_abc","email":"alice@x.com","tagline":"Build"}`;
    const out = sanitizeHydration(input);
    expect(out).not.toContain("u_abc");
    expect(out).not.toContain("alice@x.com");
    expect(out).toContain("Build");
  });

  it("removes build artifacts like buildId, assetPrefix", () => {
    const input = `{"buildId":"abc123","assetPrefix":"/_next","tagline":"Build"}`;
    const out = sanitizeHydration(input);
    expect(out).not.toContain("buildId");
    expect(out).not.toContain("assetPrefix");
    expect(out).toContain("Build");
  });

  it("caps total length at 300KB", () => {
    const filler = "Lorem ipsum dolor sit amet, ".repeat(20_000);
    const out = sanitizeHydration(filler);
    expect(out.length).toBeLessThanOrEqual(300_000);
  });
});
