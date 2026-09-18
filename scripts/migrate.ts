// Standalone migration runner for a controlled release step.
//
// Use `npm run db:migrate` outside production.
// Use `npm run db:migrate:release` for production.
//
// On Vercel the runtime DATABASE_URL points at Supabase's transaction
// pooler (port 6543) which rotates backend connections between queries
// and doesn't preserve session-level state (advisory locks, prepared
// statements, etc.). Migrations need a session connection, so they
// prefer DATABASE_DIRECT_URL when set. Local dev keeps the single
// DATABASE_URL.
//
// `dotenv/config` first, and before every other import: a deploy platform
// injects DATABASE_URL directly into the process environment, but local dev
// keeps it in .env, which nothing loads otherwise - server/app.ts does this
// same import for the same reason (npm run dev works without it precisely
// because it goes through app.ts first; this standalone script does not).
// Must run before `./migrationRelease` and everything else below, all of
// which either read process.env themselves or import server/db.ts, which
// reads it at module load time.
import "dotenv/config";

import {
  assertProductionMigrationReady,
  isBootstrapMigrationCommand,
  isReleaseMigrationCommand,
  migrationLedgerModeForCommand,
} from "./migrationRelease";

async function main(): Promise<void> {
  const isBootstrapCommand = isBootstrapMigrationCommand(process.argv);
  const isReleaseCommand = isReleaseMigrationCommand(process.argv);
  assertProductionMigrationReady({
    nodeEnv: process.env.NODE_ENV,
    isReleaseCommand,
    isBootstrapCommand,
    confirmation: process.env.CONFIRM_PRODUCTION_MIGRATIONS,
    environment: process.env,
  });

  // Swap DATABASE_URL → DATABASE_DIRECT_URL **before** importing any
  // module that reads from process.env at load time (server/db.ts does).
  const directUrl = process.env.DATABASE_DIRECT_URL;
  if (directUrl) {
    process.env.DATABASE_URL = directUrl;
  }

  // Import application modules only after the production gate passes.
  const { logger } = await import("../server/lib/logger");
  if (directUrl) logger.info("migrate: using DATABASE_DIRECT_URL for session connection");

  const { applyMigrations } = await import("../server/lib/migrationRunner");
  const { pool } = await import("../server/db");

  try {
    await applyMigrations({
      ledgerMode: migrationLedgerModeForCommand({
        nodeEnv: process.env.NODE_ENV,
        isReleaseCommand,
      }),
    });
    logger.info("migrate: complete");
  } catch (err) {
    logger.error({ err }, "migrate: failed");
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {
      // ignore - we're exiting anyway
    }
  }
}

main();
