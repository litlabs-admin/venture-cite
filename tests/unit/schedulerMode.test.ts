import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseSchedulerBoolean,
  resolveSchedulerMode,
  type SchedulerEnvironment,
} from "../../server/lib/schedulerMode";

function schedulerEnvironment(overrides: Partial<SchedulerEnvironment> = {}): SchedulerEnvironment {
  return {
    nodeEnv: "production",
    isVercel: false,
    disableInProcessScheduler: false,
    externalCronOrchestratorEnabled: false,
    ...overrides,
  };
}

describe("scheduler mode", () => {
  it("rejects a production external orchestrator with an active in-process scheduler", () => {
    expect(() =>
      resolveSchedulerMode(schedulerEnvironment({ externalCronOrchestratorEnabled: true })),
    ).toThrow("Production external cron orchestration requires DISABLE_IN_PROCESS_SCHEDULER=true");
  });

  it("selects the external scheduler when production disables the in-process scheduler", () => {
    expect(
      resolveSchedulerMode(
        schedulerEnvironment({
          externalCronOrchestratorEnabled: true,
          disableInProcessScheduler: true,
        }),
      ),
    ).toBe("external");
  });

  it("rejects production when no scheduler owns scheduled work", () => {
    expect(() =>
      resolveSchedulerMode(schedulerEnvironment({ disableInProcessScheduler: true })),
    ).toThrow("Production scheduler disablement requires EXTERNAL_CRON_ORCHESTRATOR_ENABLED=true");
  });

  it("uses the in-process scheduler in production by default", () => {
    expect(resolveSchedulerMode(schedulerEnvironment())).toBe("in-process");
  });

  it("keeps local development scheduling active", () => {
    expect(
      resolveSchedulerMode(
        schedulerEnvironment({
          nodeEnv: "development",
          externalCronOrchestratorEnabled: true,
        }),
      ),
    ).toBe("in-process");
  });

  it.each([
    { disableInProcessScheduler: false, externalCronOrchestratorEnabled: false },
    { disableInProcessScheduler: false, externalCronOrchestratorEnabled: true },
    { disableInProcessScheduler: true, externalCronOrchestratorEnabled: false },
    { disableInProcessScheduler: true, externalCronOrchestratorEnabled: true },
  ])(
    "uses the external scheduler on Vercel for $disableInProcessScheduler/$externalCronOrchestratorEnabled",
    (overrides) => {
      expect(resolveSchedulerMode(schedulerEnvironment({ isVercel: true, ...overrides }))).toBe(
        "external",
      );
    },
  );
});

describe("scheduler environment booleans", () => {
  it.each(["true", "TRUE", "1", "yes", "on"])('parses "%s" as true', (value) => {
    expect(parseSchedulerBoolean(value)).toBe(true);
  });

  it.each(["false", "FALSE", "0", "no", "off", ""])('parses "%s" as false', (value) => {
    expect(parseSchedulerBoolean(value)).toBe(false);
  });

  it("parses an unset value as false", () => {
    expect(parseSchedulerBoolean(undefined)).toBe(false);
  });

  it("trims scheduler values", () => {
    expect(parseSchedulerBoolean("  true  ")).toBe(true);
    expect(parseSchedulerBoolean("  false  ")).toBe(false);
  });

  it("rejects an unknown value", () => {
    expect(() => parseSchedulerBoolean("enabled")).toThrow("must be a scheduler boolean");
  });
});

describe("production scheduler configuration", () => {
  it("keeps the in-process scheduler as the Render owner", () => {
    const renderConfig = readFileSync(
      path.resolve(import.meta.dirname, "../../render.yaml"),
      "utf8",
    );

    expect(renderConfig).toMatch(
      /key: DISABLE_IN_PROCESS_SCHEDULER\s+value: "false"[\s\S]*key: EXTERNAL_CRON_ORCHESTRATOR_ENABLED\s+value: "false"/,
    );
  });
});
