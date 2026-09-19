import { describe, expect, it } from "vitest";
import { onboardingIpSalt } from "../../server/onboardingSession/ipSalt";

// Production shipped without SESSION_SECRET, the salt threw, and every
// POST /api/public/onboarding/sessions returned 500. These pin the fallback.
describe("onboardingIpSalt", () => {
  it("uses SESSION_SECRET when it is set", () => {
    expect(
      onboardingIpSalt({
        NODE_ENV: "production",
        SESSION_SECRET: "s",
        SUPABASE_SERVICE_ROLE_KEY: "k",
      }),
    ).toBe("s");
  });

  it("falls back to SUPABASE_SERVICE_ROLE_KEY in production instead of throwing", () => {
    expect(onboardingIpSalt({ NODE_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "k" })).toBe("k");
  });

  it("throws in production only when neither secret exists", () => {
    expect(() => onboardingIpSalt({ NODE_ENV: "production" })).toThrow(/SESSION_SECRET/);
  });

  it("uses a fixed development salt outside production", () => {
    expect(onboardingIpSalt({ NODE_ENV: "development" })).toBe("onboarding-session-dev-salt");
  });
});
