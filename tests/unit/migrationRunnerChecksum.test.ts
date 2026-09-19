import { describe, expect, it } from "vitest";
import {
  checksumMigration,
  classifyMigrationChecksum,
  equivalentMigrationChecksums,
} from "../../server/lib/migrationChecksums";

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

  // Production's ledger recorded 92 of 137 checksums from a CRLF checkout
  // before .gitattributes enforced LF. The repo files are LF with identical
  // content, and every release failed with "checksum mismatch" on them.
  it("accepts a migration recorded with CRLF line endings when the file is LF", () => {
    const lfText = "CREATE TABLE t (id int);\nSELECT 1;\n";
    const recordedFromCrlf = checksumMigration(lfText.replace(/\n/g, "\r\n"));
    expect(
      classifyMigrationChecksum({
        filename: "0001_example.sql",
        appliedChecksum: recordedFromCrlf,
        currentChecksum: checksumMigration(lfText),
        equivalentChecksums: equivalentMigrationChecksums(lfText),
      }),
    ).toBe("verified");
  });

  it("accepts a migration recorded with LF when the file on disk is CRLF", () => {
    const lfText = "SELECT 1;\n";
    const crlfText = lfText.replace(/\n/g, "\r\n");
    expect(
      classifyMigrationChecksum({
        filename: "0001_example.sql",
        appliedChecksum: checksumMigration(lfText),
        currentChecksum: checksumMigration(crlfText),
        equivalentChecksums: equivalentMigrationChecksums(crlfText),
      }),
    ).toBe("verified");
  });

  it("still rejects changed content, whatever the line endings", () => {
    const recorded = checksumMigration("SELECT 1;\r\n");
    const changed = "SELECT 2;\n";
    expect(() =>
      classifyMigrationChecksum({
        filename: "0001_example.sql",
        appliedChecksum: recorded,
        currentChecksum: checksumMigration(changed),
        equivalentChecksums: equivalentMigrationChecksums(changed),
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
