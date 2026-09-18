import { describe, expect, it } from "vitest";
import { isEmailDeliveryEnabled } from "../../server/lib/environmentSafety";

describe("development environment safety", () => {
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
