// Auto-apply pending SQL migrations from ./migrations/*.sql.
//
// The controlled release script calls this module.
// An advisory lock prevents concurrent release jobs from racing.

import { promises as fs } from "fs";
import path from "path";
import { pool } from "../db";
import { logger } from "./logger";
import { checksumMigration, classifyMigrationChecksum } from "./migrationChecksums";

const APPLY_LOCK_KEY = 0x564d_4944; // "VMID" - distinct from app-level locks

export async function applyMigrations(): Promise<void> {
  const dir = path.resolve(process.cwd(), "migrations");
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "ENOENT") {
      logger.info("applyMigrations: no migrations directory - skipping");
      return;
    }
    throw err;
  }

  // Hold a session-level advisory lock for the whole apply pass. If another
  // build/boot is already mid-apply, we block until they're done - which is
  // safe because applyMigrations is idempotent.
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock($1)", [APPLY_LOCK_KEY]);

    await lockClient.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        checksum TEXT
      );
    `);

    await lockClient.query(`
      ALTER TABLE public.schema_migrations
      ADD COLUMN IF NOT EXISTS checksum TEXT;
    `);

    const applied = await lockClient.query<{ filename: string; checksum: string | null }>(
      "SELECT filename, checksum FROM public.schema_migrations",
    );
    const appliedByFilename = new Map(applied.rows.map((row) => [row.filename, row.checksum]));

    for (const f of files) {
      const sqlText = await fs.readFile(path.join(dir, f), "utf8");
      const checksum = checksumMigration(sqlText);
      const checksumState = classifyMigrationChecksum({
        filename: f,
        appliedChecksum: appliedByFilename.get(f),
        currentChecksum: checksum,
      });

      if (checksumState === "verified") {
        continue;
      }

      if (checksumState === "legacy") {
        await lockClient.query(
          `UPDATE public.schema_migrations
           SET checksum = $2
           WHERE filename = $1 AND checksum IS NULL`,
          [f, checksum],
        );
        logger.warn({ filename: f }, "applyMigrations: recorded legacy checksum");
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sqlText);
        await client.query(
          `INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)
             ON CONFLICT (filename) DO NOTHING`,
          [f, checksum],
        );
        await client.query("COMMIT");
        logger.info({ filename: f }, "applyMigrations: applied");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        logger.error({ err, filename: f }, "applyMigrations: failed");
        throw err;
      } finally {
        client.release();
      }
    }
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [APPLY_LOCK_KEY]);
    } catch (err) {
      logger.warn({ err }, "applyMigrations: unlock failed");
    }
    lockClient.release();
  }
}
