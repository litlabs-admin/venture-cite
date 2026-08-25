import { selectDatabaseMetadataAuditTarget } from "./databaseMetadataAuditTarget";

const REQUIRED_CONFIRMATION = "venturecite-read-only";

async function main(): Promise<void> {
  process.env.NODE_ENV = "production";
  selectDatabaseMetadataAuditTarget(process.env);
  const [{ logger }, { runDatabaseMetadataAudit }] = await Promise.all([
    import("../server/lib/logger"),
    import("../server/lib/databaseMetadataAudit"),
  ]);

  if (process.env.CONFIRM_DATABASE_METADATA_AUDIT !== REQUIRED_CONFIRMATION) {
    throw new Error(
      "Set CONFIRM_DATABASE_METADATA_AUDIT=venturecite-read-only before the metadata audit.",
    );
  }

  const { pool } = await import("../server/db");
  const client = await pool.connect();

  try {
    const report = await runDatabaseMetadataAudit(client);
    logger.info({ audit: report }, "database metadata audit complete");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async () => {
  process.env.NODE_ENV = "production";
  try {
    const { logger } = await import("../server/lib/logger");
    logger.error("database metadata audit failed");
  } catch {
    try {
      process.stderr.write("database metadata audit failed\n");
    } catch {
      // The process exit code remains the final failure signal.
    }
  }
  process.exitCode = 1;
});
