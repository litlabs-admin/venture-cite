import { describe, it, expect } from "vitest";
import { redactSecretsFromFacts } from "../../server/lib/factAgent/secretRedactor";
import type { ExtractedFact } from "../../server/lib/factAgent/types";

const fact = (
  factValue: string,
  valuePayload: Record<string, unknown> | null = null,
): ExtractedFact => ({
  domain: "identity",
  subcategory: "description",
  factKey: "primary",
  factValue,
  valueType: valuePayload ? "array" : "string",
  valuePayload,
  confidence: 0.9,
  sourceExcerpt: "ctx",
  sourceUrl: "https://example.com",
});

describe("redactSecretsFromFacts", () => {
  it("keeps secret-free facts", () => {
    const out = redactSecretsFromFacts([fact("We make accounting software")]);
    expect(out.kept).toHaveLength(1);
    expect(out.dropped).toBe(0);
  });

  it("drops Stripe live keys", () => {
    // Assemble at runtime so the literal Stripe-key pattern never appears
    // in source (would trip GitHub's secret scanner push-protection).
    const fakeLive = "sk_" + "live_" + "a".repeat(24);
    const out = redactSecretsFromFacts([fact(`Contact: ${fakeLive}`)]);
    expect(out.dropped).toBe(1);
  });

  it("drops Stripe test keys", () => {
    const fakeTest = "sk_" + "test_" + "a".repeat(24);
    const out = redactSecretsFromFacts([fact(`Demo key ${fakeTest}`)]);
    expect(out.dropped).toBe(1);
  });

  it("drops AWS access keys", () => {
    const out = redactSecretsFromFacts([fact("ENV: AKIAIOSFODNN7EXAMPLE")]);
    expect(out.dropped).toBe(1);
  });

  it("drops GitHub personal access tokens (ghp_)", () => {
    const out = redactSecretsFromFacts([fact("token=ghp_" + "a".repeat(36))]);
    expect(out.dropped).toBe(1);
  });

  it("drops GitHub OAuth tokens (gho_)", () => {
    const out = redactSecretsFromFacts([fact("token=gho_" + "b".repeat(36))]);
    expect(out.dropped).toBe(1);
  });

  it("drops Slack bot tokens", () => {
    const out = redactSecretsFromFacts([fact("slack: xoxb-1234-5678-abcdEFGH")]);
    expect(out.dropped).toBe(1);
  });

  it("drops JWT-shaped strings", () => {
    const out = redactSecretsFromFacts([
      fact("auth: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signaturepart"),
    ]);
    expect(out.dropped).toBe(1);
  });

  it("drops private-key headers", () => {
    const out = redactSecretsFromFacts([
      fact("-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA..."),
    ]);
    expect(out.dropped).toBe(1);
  });

  it("drops array facts whose valuePayload.items contains a secret", () => {
    const out = redactSecretsFromFacts([
      fact("a, b, AKIAIOSFODNN7EXAMPLE", { items: ["a", "b", "AKIAIOSFODNN7EXAMPLE"] }),
    ]);
    expect(out.dropped).toBe(1);
  });

  it("does NOT false-positive on short random-looking strings", () => {
    const out = redactSecretsFromFacts([fact("Founded in 2014, Series B 2021")]);
    expect(out.kept).toHaveLength(1);
  });
});
