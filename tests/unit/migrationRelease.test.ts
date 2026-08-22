import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import { describe, expect, it } from "vitest";
import {
  assertProductionMigrationEnvironment,
  assertProductionMigrationReady,
  assertReleaseMigrationConfirmation,
  isBootstrapMigrationCommand,
  isReleaseMigrationCommand,
  migrationLedgerModeForCommand,
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

  it("detects the bootstrap argument", () => {
    expect(isBootstrapMigrationCommand(["node", "scripts/migrate.ts", "--bootstrap"])).toBe(true);
    expect(isBootstrapMigrationCommand(["node", "scripts/migrate.ts"])).toBe(false);
  });

  it("rejects bootstrap outside production", () => {
    expect(() =>
      assertProductionMigrationReady({
        nodeEnv: "development",
        isReleaseCommand: true,
        isBootstrapCommand: true,
        confirmation: "venturecite-production",
        environment: {},
      }),
    ).toThrow("NODE_ENV=production");
  });

  it("uses the application ledger for every production release", () => {
    expect(migrationLedgerModeForCommand({ nodeEnv: "production", isReleaseCommand: true })).toBe(
      "application-only",
    );
    expect(migrationLedgerModeForCommand({ nodeEnv: "development", isReleaseCommand: false })).toBe(
      "reconcile-supabase",
    );
  });

  it("allows a confirmed bootstrap with strict TLS and a session pooler", () => {
    const directory = mkdtempSync(join(tmpdir(), "venturecite-migration-bootstrap-"));
    const certificatePath = join(directory, "certificate.pem");
    writeFileSync(certificatePath, rootCertificates[0]);
    try {
      expect(() =>
        assertProductionMigrationReady({
          nodeEnv: "production",
          isReleaseCommand: true,
          isBootstrapCommand: true,
          confirmation: "venturecite-production",
          environment: {
            DATABASE_CA_CERT_PATH: certificatePath,
            DATABASE_DIRECT_URL:
              "postgresql://postgres:secret@aws-0-region.pooler.supabase.com:5432/postgres",
          },
        }),
      ).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a transaction pooler during bootstrap", () => {
    expect(() =>
      assertProductionMigrationReady({
        nodeEnv: "production",
        isReleaseCommand: true,
        isBootstrapCommand: true,
        confirmation: "venturecite-production",
        environment: {
          DATABASE_CA_CERT_PATH: "missing-certificate",
          DATABASE_DIRECT_URL:
            "postgresql://postgres:secret@aws-0-region.pooler.supabase.com:6543/postgres",
        },
      }),
    ).toThrow("DATABASE_DIRECT_URL");
  });

  it("requires the full release preflight, including an approved direct session URL", () => {
    expect(() => assertProductionMigrationEnvironment({})).toThrow("DATABASE_DIRECT_URL");
    expect(() =>
      assertProductionMigrationEnvironment({
        DATABASE_DIRECT_URL: "postgresql://release.example.com:6543/postgres",
      }),
    ).toThrow("DATABASE_DIRECT_URL");
  });

  it("does not treat the legacy confirmation as a complete release gate", () => {
    expect(() =>
      assertProductionMigrationReady({
        nodeEnv: "production",
        isReleaseCommand: true,
        confirmation: "venturecite-production",
        environment: {},
      }),
    ).toThrow("DATABASE_DIRECT_URL");
  });

  it("skips the production gate outside production", () => {
    expect(() =>
      assertProductionMigrationReady({
        nodeEnv: "development",
        isReleaseCommand: false,
        confirmation: undefined,
        environment: {},
      }),
    ).not.toThrow();
  });
});
