import { describe, expect, it } from "vitest";
import {
  devListenHost,
  LOCAL_FAKE_HOST,
  NORMAL_DEV_HOST,
  startupAutopilotEnabled,
  stripeSetupEnabled,
} from "../../server/lib/localFlowSafety";

describe("local flow startup safety", () => {
  it("binds fake mode to loopback and normal development to all interfaces", () => {
    expect(devListenHost("fake")).toBe(LOCAL_FAKE_HOST);
    expect(devListenHost("openai")).toBe(NORMAL_DEV_HOST);
    expect(devListenHost(undefined)).toBe(NORMAL_DEV_HOST);
  });

  it("disables startup work when local safety flags are set", () => {
    expect(
      startupAutopilotEnabled({
        CONTENT_GENERATION_PROVIDER: "fake",
        DISABLE_STARTUP_AUTOPILOT: "true",
        DISABLE_STRIPE_SETUP: "true",
        STRIPE_SECRET_KEY: "configured-test-key",
      }),
    ).toBe(false);
    expect(
      stripeSetupEnabled({
        CONTENT_GENERATION_PROVIDER: "fake",
        DISABLE_STARTUP_AUTOPILOT: "true",
        DISABLE_STRIPE_SETUP: "true",
        STRIPE_SECRET_KEY: "configured-test-key",
      }),
    ).toBe(false);
  });
});
