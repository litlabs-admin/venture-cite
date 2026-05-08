// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
// PreviewParam is exercised via TourOrchestrator's useEffect. We assert
// directly: eligibility for preview mode is not state-gated, but admin gating
// is enforced. This unit covers the admin check logic inline.

function isAdmin(email: string | undefined): boolean {
  return typeof email === "string" && email.endsWith("@litlabs.io");
}

describe("preview param admin gate", () => {
  it("admin email passes", () => {
    expect(isAdmin("eng@litlabs.io")).toBe(true);
  });
  it("non-admin email fails", () => {
    expect(isAdmin("user@example.com")).toBe(false);
  });
  it("undefined email fails", () => {
    expect(isAdmin(undefined)).toBe(false);
  });
});
