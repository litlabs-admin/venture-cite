// Auto-apply pending SQL migrations from ./migrations/*.sql.
//
// The controlled release script calls this module.
// An advisory lock prevents concurrent release jobs from racing.

import { promises as fs } from "fs";
import path from "path";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { logger } from "./logger";
import { checksumMigration, classifyMigrationChecksum } from "./migrationChecksums";
import { isCustomOrmPreviewLedgerMode } from "./migrationLedgerPolicy";

const APPLY_LOCK_KEY = 0x564d_4944; // "VMID" - distinct from app-level locks
const SUPABASE_LEDGER_CHECKSUM_PATTERN = /(?:^|\n)-- SHA256:\s*([0-9a-f]{64})/i;

type MigrationFile = {
  filename: string;
  sqlText: string;
  checksum: string;
};

type SupabaseMigrationLedgerRow = {
  name: string;
  firstStatement: string | null;
};

type ApplicationMigrationLedgerRow = {
  filename: string;
  checksum: string | null;
};

export type MigrationLedgerMode = "reconcile-supabase" | "application-only";

export function isNoTransactionMigration(sqlText: string): boolean {
  return /^[^\S\r\n\u2028\u2029]*-- migrate:no-transaction[^\S\r\n\u2028\u2029]*\r?$/m.test(
    sqlText,
  );
}

async function seedCustomOrmPreviewLedger(
  lockClient: PoolClient,
  migrationFiles: readonly MigrationFile[],
  baselineFilename: string,
): Promise<void> {
  const baselineIndex = migrationFiles.findIndex(
    (migration) => migration.filename === baselineFilename,
  );
  if (baselineIndex < 0) {
    throw new Error(
      `Supabase preview migration baseline is not present in root migrations: ${baselineFilename}`,
    );
  }

  const baselineFiles = migrationFiles.slice(0, baselineIndex + 1);
  const existingResult = await lockClient.query<ApplicationMigrationLedgerRow>(
    "SELECT filename, checksum FROM public.schema_migrations",
  );
  const existingByFilename = new Map(
    existingResult.rows.map((row) => [row.filename, row.checksum]),
  );
  for (const migration of baselineFiles) {
    const existingChecksum = existingByFilename.get(migration.filename);
    if (existingChecksum !== undefined && existingChecksum !== null) {
      if (existingChecksum !== migration.checksum) {
        throw new Error(`Migration checksum mismatch for ${migration.filename}`);
      }
    }
  }

  for (const migration of baselineFiles) {
    await lockClient.query(
      `
        INSERT INTO public.schema_migrations (filename, checksum)
        VALUES ($1, $2)
        ON CONFLICT (filename) DO UPDATE
        SET checksum = COALESCE(public.schema_migrations.checksum, EXCLUDED.checksum)
      `,
      [migration.filename, migration.checksum],
    );
  }
  logger.warn(
    { baselineFilename, count: baselineFiles.length },
    "applyMigrations: seeded the application ledger from the approved preview schema baseline",
  );
}

async function reconcileSupabaseMigrationLedger(
  lockClient: PoolClient,
  migrationFiles: readonly MigrationFile[],
): Promise<void> {
  const tableResult = await lockClient.query<{ exists: boolean }>(
    "SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS exists",
  );
  if (!tableResult.rows[0]?.exists) return;

  const ledgerResult = await lockClient.query<SupabaseMigrationLedgerRow>(`
    SELECT name, statements[1] AS "firstStatement"
    FROM supabase_migrations.schema_migrations
    WHERE name IS NOT NULL
  `);
  const ledgerByName = new Map(ledgerResult.rows.map((row) => [row.name, row]));
  const missing: string[] = [];
  const mismatched: string[] = [];

  for (const migration of migrationFiles) {
    const name = migration.filename.slice(0, -4);
    const ledgerRow = ledgerByName.get(name);
    const ledgerChecksum = ledgerRow?.firstStatement?.match(SUPABASE_LEDGER_CHECKSUM_PATTERN)?.[1];

    if (!ledgerChecksum) {
      missing.push(migration.filename);
      continue;
    }
    if (ledgerChecksum.toLowerCase() !== migration.checksum) {
      mismatched.push(migration.filename);
    }
  }

  if (missing.length > 0 || mismatched.length > 0) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
      mismatched.length > 0 ? `checksum mismatch: ${mismatched.join(", ")}` : null,
    ]
      .filter((detail): detail is string => detail !== null)
      .join("; ");
    throw new Error(`Supabase migration ledger does not match root migrations (${details})`);
  }

  if (migrationFiles.length === 0) return;

  await lockClient.query(
    `
      INSERT INTO public.schema_migrations (filename, checksum)
      SELECT * FROM unnest($1::text[], $2::text[])
      ON CONFLICT (filename) DO NOTHING
    `,
    [
      migrationFiles.map((migration) => migration.filename),
      migrationFiles.map((migration) => migration.checksum),
    ],
  );
  logger.info(
    { count: migrationFiles.length },
    "applyMigrations: reconciled Supabase migration ledger",
  );
}

export async function applyMigrations(
  options: {
    ledgerMode?: MigrationLedgerMode;
  } = {},
): Promise<void> {
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

    // The ledger is internal release state. Keep it out of the public Data API.
    await lockClient.query(`
      ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE public.schema_migrations FROM anon, authenticated;
    `);

    const migrationFiles = await Promise.all(
      files.map(async (filename): Promise<MigrationFile> => {
        const sqlText = await fs.readFile(path.join(dir, filename), "utf8");
        return { filename, sqlText, checksum: checksumMigration(sqlText) };
      }),
    );
    if (process.env.SUPABASE_CUSTOM_ORM_PREVIEW === "true") {
      const baselineFilename = process.env.SUPABASE_CUSTOM_ORM_PREVIEW_BASELINE;
      if (!isCustomOrmPreviewLedgerMode(process.env) || !baselineFilename?.trim()) {
        throw new Error(
          "SUPABASE_CUSTOM_ORM_PREVIEW=true requires development mode, remote-service opt-in, and SUPABASE_CUSTOM_ORM_PREVIEW_BASELINE.",
        );
      }
      await seedCustomOrmPreviewLedger(lockClient, migrationFiles, baselineFilename.trim());
      logger.warn(
        "applyMigrations: skipping Supabase platform ledger reconciliation for the approved preview branch",
      );
    } else if (options.ledgerMode !== "application-only") {
      await reconcileSupabaseMigrationLedger(lockClient, migrationFiles);
    } else {
      logger.warn(
        "applyMigrations: using the application ledger for a controlled production release",
      );
    }

    const applied = await lockClient.query<{ filename: string; checksum: string | null }>(
      "SELECT filename, checksum FROM public.schema_migrations",
    );
    const appliedByFilename = new Map(applied.rows.map((row) => [row.filename, row.checksum]));

    for (const migration of migrationFiles) {
      const checksumState = classifyMigrationChecksum({
        filename: migration.filename,
        appliedChecksum: appliedByFilename.get(migration.filename),
        currentChecksum: migration.checksum,
      });

      if (checksumState === "verified") {
        continue;
      }

      if (checksumState === "legacy") {
        await lockClient.query(
          `UPDATE public.schema_migrations
           SET checksum = $2
           WHERE filename = $1 AND checksum IS NULL`,
          [migration.filename, migration.checksum],
        );
        logger.warn({ filename: migration.filename }, "applyMigrations: recorded legacy checksum");
        continue;
      }

      // A no-transaction migration can partially apply before it fails.
      // It has no ledger row, and a rerun replays the whole file.
      // Every statement must use IF NOT EXISTS, IF EXISTS, or ON CONFLICT DO NOTHING.
      if (isNoTransactionMigration(migration.sqlText)) {
        const client = await pool.connect();
        try {
          await client.query(migration.sqlText);
          await client.query(
            `INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)
               ON CONFLICT (filename) DO NOTHING`,
            [migration.filename, migration.checksum],
          );
          logger.info({ filename: migration.filename }, "applyMigrations: applied");
        } catch (err) {
          logger.error({ err, filename: migration.filename }, "applyMigrations: failed");
          throw err;
        } finally {
          client.release();
        }
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(migration.sqlText);
        await client.query(
          `INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)
             ON CONFLICT (filename) DO NOTHING`,
          [migration.filename, migration.checksum],
        );
        await client.query("COMMIT");
        logger.info({ filename: migration.filename }, "applyMigrations: applied");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        logger.error({ err, filename: migration.filename }, "applyMigrations: failed");
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
