import { describe, it, expect } from "vitest";
import { positiveIntEnv } from "../../server/lib/envNumber";

// Backs AUTO_CITATION_MAX_BRANDS_PER_RUN (server/scheduler.ts) and
// BRAND_ACTIVATION_MAX_BRANDS_PER_RUN (server/lib/brandActivation.ts).
describe("positiveIntEnv", () => {
  it("uses the default when the value is unset", () => {
    expect(positiveIntEnv(undefined, 5)).toBe(5);
  });

  it("uses the default for an invalid (non-numeric) value", () => {
    expect(positiveIntEnv("not-a-number", 5)).toBe(5);
  });

  it("uses the default for zero or a negative value", () => {
    expect(positiveIntEnv("0", 5)).toBe(5);
    expect(positiveIntEnv("-3", 5)).toBe(5);
  });

  it("uses the parsed value when it is a valid positive number", () => {
    expect(positiveIntEnv("12", 5)).toBe(12);
  });
});
