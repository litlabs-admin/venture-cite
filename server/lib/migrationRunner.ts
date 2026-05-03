// Auto-apply pending SQL migrations from ./migrations/*.sql.
//
// Vercel migration: extracted from server/index.ts so a separate
// `npm run db:migrate` script can call it during build, instead of
// running on every cold start. An advisory lock prevents two
// concurrent build/boot invocations from racing.

import { promises as fs } from "fs";
import path from "path";
import { pool } from "../db";
import { logger } from "./logger";

const APPLY_LOCK_KEY = 0x564d_4944; // "VMID" — distinct from app-level locks

export async function applyMigrations(): Promise<void> {
  const dir = path.resolve(process.cwd(), "migrations");
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "ENOENT") {
      logger.info("applyMigrations: no migrations directory — skipping");
      return;
    }
    throw err;
  }

  // Hold a session-level advisory lock for the whole apply pass. If another
  // build/boot is already mid-apply, we block until they're done — which is
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

    const applied = await lockClient.query<{ filename: string }>(
      "SELECT filename FROM public.schema_migrations",
    );
    const appliedSet = new Set(applied.rows.map((r) => r.filename));

    for (const f of files) {
      if (appliedSet.has(f)) continue;
      const sqlText = await fs.readFile(path.join(dir, f), "utf8");

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sqlText);
        await client.query(
          `INSERT INTO public.schema_migrations (filename) VALUES ($1)
             ON CONFLICT (filename) DO NOTHING`,
          [f],
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
