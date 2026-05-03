// Standalone migration runner for the Vercel build step.
//
// Usage: `npm run db:migrate` — invoked from package.json's build script
// before vite + esbuild. Applies any pending migrations sequentially.
// Exits non-zero on failure so the build aborts before deploying a
// schema-mismatched function bundle.
//
// On Vercel the runtime DATABASE_URL points at Supabase's transaction
// pooler (port 6543) which rotates backend connections between queries
// and doesn't preserve session-level state (advisory locks, prepared
// statements, etc.). Migrations need a session connection, so they
// prefer DATABASE_DIRECT_URL when set. Local dev keeps the single
// DATABASE_URL.

import { logger } from "../server/lib/logger";

async function main(): Promise<void> {
  // Swap DATABASE_URL → DATABASE_DIRECT_URL **before** importing any
  // module that reads from process.env at load time (server/db.ts does).
  const directUrl = process.env.DATABASE_DIRECT_URL;
  if (directUrl) {
    process.env.DATABASE_URL = directUrl;
    logger.info("migrate: using DATABASE_DIRECT_URL for session connection");
  }

  const { applyMigrations } = await import("../server/lib/migrationRunner");
  const { pool } = await import("../server/db");

  try {
    await applyMigrations();
    logger.info("migrate: complete");
  } catch (err) {
    logger.error({ err }, "migrate: failed");
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {
      // ignore — we're exiting anyway
    }
  }
}

main();
