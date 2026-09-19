import { createHash } from "node:crypto";

export function checksumMigration(sqlText: string): string {
  return createHash("sha256").update(sqlText, "utf8").digest("hex");
}

/**
 * The checksums a migration file may legitimately have been recorded under:
 * its content with LF line endings and with CRLF line endings.
 *
 * Production's ledger holds both. On 2026-09-19, 92 of 137 recorded
 * checksums matched the CRLF form and 38 the LF form, with no content
 * differences: early migrations were applied from a Windows checkout before
 * .gitattributes enforced `eol=lf`. Comparing only the exact bytes made every
 * release fail with "checksum mismatch" on files that had never changed.
 * Content is still verified byte for byte; only the newline style is
 * tolerated.
 */
export function equivalentMigrationChecksums(sqlText: string): string[] {
  const lf = sqlText.replace(/\r\n/g, "\n");
  return [checksumMigration(lf), checksumMigration(lf.replace(/\n/g, "\r\n"))];
}

export function classifyMigrationChecksum(options: {
  filename: string;
  appliedChecksum: string | null | undefined;
  currentChecksum: string;
  /** Other checksums the same content may have been recorded under. */
  equivalentChecksums?: readonly string[];
}): "pending" | "legacy" | "verified" {
  if (options.appliedChecksum === undefined) return "pending";
  if (options.appliedChecksum === null) return "legacy";
  if (options.appliedChecksum === options.currentChecksum) return "verified";
  if (options.equivalentChecksums?.includes(options.appliedChecksum)) return "verified";
  throw new Error(`Migration checksum mismatch for ${options.filename}`);
}
