import { describe, expect, it } from "vitest";
import { selectDatabaseMetadataAuditTarget } from "../../scripts/databaseMetadataAuditTarget";

describe("database metadata audit target", () => {
  it("keeps DATABASE_URL as the default target", () => {
    const environment = {
      DATABASE_URL: "postgresql://default.example.test/database?sslmode=require",
      DATABASE_DIRECT_URL: "postgresql://direct.example.test/database?sslmode=verify-full",
    };

    selectDatabaseMetadataAuditTarget(environment);

    expect(environment.DATABASE_URL).toBe(
      "postgresql://default.example.test/database?sslmode=require",
    );
  });

  it("copies the direct URL without changing its TLS parameters", () => {
    const environment = {
      DATABASE_URL: "postgresql://default.example.test/database",
      DATABASE_DIRECT_URL:
        "postgresql://direct.example.test/database?sslmode=verify-full&sslrootcert=project.crt",
      DATABASE_METADATA_AUDIT_TARGET: "direct",
    };

    selectDatabaseMetadataAuditTarget(environment);

    expect(environment.DATABASE_URL).toBe(environment.DATABASE_DIRECT_URL);
  });

  it("fails with a fixed message when the direct URL is missing", () => {
    expect(() =>
      selectDatabaseMetadataAuditTarget({ DATABASE_METADATA_AUDIT_TARGET: "direct" }),
    ).toThrow("DATABASE_DIRECT_URL is required for the direct metadata audit target");
  });

  it("rejects an unknown target without including its value", () => {
    expect(() =>
      selectDatabaseMetadataAuditTarget({ DATABASE_METADATA_AUDIT_TARGET: "secret-role-name" }),
    ).toThrow("DATABASE_METADATA_AUDIT_TARGET must be direct or unset");
  });
});
