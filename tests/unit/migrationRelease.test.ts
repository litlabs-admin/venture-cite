import { describe, expect, it } from "vitest";
import {
  assertReleaseMigrationConfirmation,
  isReleaseMigrationCommand,
} from "../../scripts/migrationRelease";

describe("migration release confirmation", () => {
  it("allows a non-production migration without confirmation", () => {
    expect(() =>
      assertReleaseMigrationConfirmation({
        nodeEnv: "development",
        isReleaseCommand: false,
        confirmation: undefined,
      }),
    ).not.toThrow();
  });

  it("requires the release command in production", () => {
    expect(() =>
      assertReleaseMigrationConfirmation({
        nodeEnv: "production",
        isReleaseCommand: false,
        confirmation: "venturecite-production",
      }),
    ).toThrow("npm run db:migrate:release");
  });

  it("requires an explicit production confirmation", () => {
    expect(() =>
      assertReleaseMigrationConfirmation({
        nodeEnv: "production",
        isReleaseCommand: true,
        confirmation: undefined,
      }),
    ).toThrow("CONFIRM_PRODUCTION_MIGRATIONS");
  });

  it("allows the confirmed release command", () => {
    expect(() =>
      assertReleaseMigrationConfirmation({
        nodeEnv: "production",
        isReleaseCommand: true,
        confirmation: "venturecite-production",
      }),
    ).not.toThrow();
  });

  it("detects the release argument", () => {
    expect(isReleaseMigrationCommand(["node", "scripts/migrate.ts", "--release"])).toBe(true);
    expect(isReleaseMigrationCommand(["node", "scripts/migrate.ts"])).toBe(false);
  });
});
