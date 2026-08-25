export interface DatabaseMetadataAuditEnvironment {
  DATABASE_URL?: string;
  DATABASE_DIRECT_URL?: string;
  DATABASE_METADATA_AUDIT_TARGET?: string;
}

export function selectDatabaseMetadataAuditTarget(
  environment: DatabaseMetadataAuditEnvironment,
): void {
  const target = environment.DATABASE_METADATA_AUDIT_TARGET;
  if (target === undefined || target === "") return;

  if (target !== "direct") {
    throw new Error("DATABASE_METADATA_AUDIT_TARGET must be direct or unset");
  }

  if (!environment.DATABASE_DIRECT_URL?.trim()) {
    throw new Error("DATABASE_DIRECT_URL is required for the direct metadata audit target");
  }

  environment.DATABASE_URL = environment.DATABASE_DIRECT_URL;
}
