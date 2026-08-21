import { describe, expect, it } from "vitest";
import {
  isEmailDeliveryEnabled,
  remoteDevelopmentServiceNames,
} from "../../server/lib/environmentSafety";

describe("development environment safety", () => {
  it("rejects remote databases and provider keys by default", () => {
    expect(
      remoteDevelopmentServiceNames({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://db.example.com/postgres",
        SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        OPENAI_API_KEY: "sk-test",
        CONTENT_GENERATION_PROVIDER: "openai",
        OPENROUTER_API_KEY: "sk-or-test",
        RESEND_API_KEY: "re-test",
        STRIPE_SECRET_KEY: "sk_test",
      }),
    ).toEqual([
      "DATABASE_URL",
      "SUPABASE_URL",
      "OPENAI_API_KEY",
      "OPENROUTER_API_KEY",
      "RESEND_API_KEY",
      "STRIPE_SECRET_KEY",
    ]);
  });

  it("allows loopback services and fake generation", () => {
    expect(
      remoteDevelopmentServiceNames({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://127.0.0.1:55322/postgres",
        SUPABASE_URL: "http://127.0.0.1:55321",
        VITE_SUPABASE_URL: "http://127.0.0.1:55321",
        OPENAI_API_KEY: "local-disabled",
        CONTENT_GENERATION_PROVIDER: "fake",
      }),
    ).toEqual([]);
  });

  it("requires explicit opt-in for remote development services", () => {
    expect(
      remoteDevelopmentServiceNames({
        NODE_ENV: "development",
        ALLOW_REMOTE_DEVELOPMENT_SERVICES: "true",
        DATABASE_URL: "postgresql://db.example.com/postgres",
        SUPABASE_URL: "https://example.supabase.co",
        OPENAI_API_KEY: "sk-test",
        CONTENT_GENERATION_PROVIDER: "openai",
      }),
    ).toEqual([]);
  });

  it("disables email by default outside production", () => {
    expect(isEmailDeliveryEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isEmailDeliveryEnabled({ NODE_ENV: "test" })).toBe(false);
    expect(isEmailDeliveryEnabled({ NODE_ENV: "production" })).toBe(true);
  });

  it("honors an explicit email delivery override", () => {
    expect(
      isEmailDeliveryEnabled({ NODE_ENV: "production", EMAIL_DELIVERY_ENABLED: "false" }),
    ).toBe(false);
    expect(
      isEmailDeliveryEnabled({ NODE_ENV: "development", EMAIL_DELIVERY_ENABLED: "true" }),
    ).toBe(true);
  });
});
