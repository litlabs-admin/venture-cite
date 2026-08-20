import { describe, expect, it } from "vitest";
import { checksumMigration, classifyMigrationChecksum } from "../../server/lib/migrationChecksums";

describe("migration checksums", () => {
  it("uses a stable SHA-256 checksum", () => {
    expect(checksumMigration("SELECT 1;\n")).toBe(
      "b4e0497804e46e0a0b0b8c31975b062152d551bac49c3c2e80932567b4085dcd",
    );
  });

  it("accepts an unchanged applied migration", () => {
    const checksum = checksumMigration("SELECT 1;");
    expect(
      classifyMigrationChecksum({
        filename: "0001_example.sql",
        appliedChecksum: checksum,
        currentChecksum: checksum,
      }),
    ).toBe("verified");
  });

  it("rejects a changed applied migration", () => {
    expect(() =>
      classifyMigrationChecksum({
        filename: "0001_example.sql",
        appliedChecksum: checksumMigration("SELECT 1;"),
        currentChecksum: checksumMigration("SELECT 2;"),
      }),
    ).toThrow("Migration checksum mismatch for 0001_example.sql");
  });

  it("marks an existing checksum gap as legacy", () => {
    expect(
      classifyMigrationChecksum({
        filename: "0001_example.sql",
        appliedChecksum: null,
        currentChecksum: checksumMigration("SELECT 1;"),
      }),
    ).toBe("legacy");
  });
});
