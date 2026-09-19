import { describe, expect, it } from "vitest";
import { isPaidJobEnabled } from "../../server/lib/paidJobSwitch";

// The owner decided on 2026-09-19 that the weekly citation scans and the
// activation sweep stay stopped until turned on deliberately.
describe("isPaidJobEnabled", () => {
  it("is off when the variable is unset", () => {
    expect(isPaidJobEnabled("AUTO_CITATION", {})).toBe(false);
    expect(isPaidJobEnabled("BRAND_ACTIVATION", {})).toBe(false);
  });

  it("is on only for the exact string 'true'", () => {
    expect(isPaidJobEnabled("AUTO_CITATION", { AUTO_CITATION_ENABLED: "true" })).toBe(true);
    for (const value of ["1", "TRUE", "yes", "false", ""]) {
      expect(isPaidJobEnabled("AUTO_CITATION", { AUTO_CITATION_ENABLED: value })).toBe(false);
    }
  });

  it("keeps the two jobs independent", () => {
    const env = { BRAND_ACTIVATION_ENABLED: "true" };
    expect(isPaidJobEnabled("BRAND_ACTIVATION", env)).toBe(true);
    expect(isPaidJobEnabled("AUTO_CITATION", env)).toBe(false);
  });
});
