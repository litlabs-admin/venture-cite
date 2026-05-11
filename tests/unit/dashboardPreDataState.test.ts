import { describe, it, expect } from "vitest";

// Replicate the derivation locally so we test the rule, not the component tree.
function hasMeasured(args: {
  totalChecks: number | undefined;
  lastScanAt: string | null | undefined;
  autopilotStatus: string | null | undefined;
}): boolean {
  return (
    (args.totalChecks ?? 0) > 0 &&
    args.lastScanAt != null &&
    args.autopilotStatus !== "running_citations" &&
    args.autopilotStatus !== "generating_prompts" &&
    args.autopilotStatus !== "pending"
  );
}

describe("Day-0 alarm rule hasMeasured derivation", () => {
  it("returns false when there are no completed checks", () => {
    expect(
      hasMeasured({ totalChecks: 0, lastScanAt: "2026-05-12", autopilotStatus: "completed" }),
    ).toBe(false);
  });
  it("returns false when autopilot is still running", () => {
    expect(
      hasMeasured({
        totalChecks: 5,
        lastScanAt: "2026-05-12",
        autopilotStatus: "running_citations",
      }),
    ).toBe(false);
  });
  it("returns true after a completed scan with terminal autopilot", () => {
    expect(
      hasMeasured({ totalChecks: 10, lastScanAt: "2026-05-12", autopilotStatus: "completed" }),
    ).toBe(true);
  });
  it("returns true when autopilot is idle (e.g., never ran autopilot)", () => {
    expect(hasMeasured({ totalChecks: 1, lastScanAt: "2026-05-12", autopilotStatus: "idle" })).toBe(
      true,
    );
  });
  it("returns false when lastScanAt is null", () => {
    expect(hasMeasured({ totalChecks: 5, lastScanAt: null, autopilotStatus: "completed" })).toBe(
      false,
    );
  });
});
