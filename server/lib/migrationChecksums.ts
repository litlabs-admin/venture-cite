import { createHash } from "node:crypto";

export function checksumMigration(sqlText: string): string {
  return createHash("sha256").update(sqlText, "utf8").digest("hex");
}

export function classifyMigrationChecksum(options: {
  filename: string;
  appliedChecksum: string | null | undefined;
  currentChecksum: string;
}): "pending" | "legacy" | "verified" {
  if (options.appliedChecksum === undefined) return "pending";
  if (options.appliedChecksum === null) return "legacy";
  if (options.appliedChecksum === options.currentChecksum) return "verified";
  throw new Error(`Migration checksum mismatch for ${options.filename}`);
}
