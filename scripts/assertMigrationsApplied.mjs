#!/usr/bin/env node
/**
 * Fails when the target database has not applied every migration in
 * `supabase/migrations/`.
 *
 * Why this exists: on 2026-08-28 a local `supabase start` reused an existing
 * Docker volume and applied only 125 of 130 migrations. Migrations 0117 to 0121
 * were silently absent, so `brands` lacked `autopilot_attempts` and
 * `autopilot_last_attempt_at` while `shared/schema.ts` declared both. Every
 * query naming those columns failed at runtime, and four integration tests
 * failed with an unhelpful 500. Nothing reported the real cause.
 *
 * `supabase db reset` fixes the local case. This script makes the condition
 * visible instead of leaving it to be rediscovered.
 *
 * Usage:
 *   TEST_DATABASE_URL=postgresql://... node scripts/assertMigrationsApplied.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set TEST_DATABASE_URL or DATABASE_URL before running this check.");
  process.exit(1);
}

const onDisk = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.split("_")[0])
  .sort();

const client = new pg.Client({ connectionString, ssl: false });

try {
  await client.connect();
  const { rows } = await client.query(
    "select version from supabase_migrations.schema_migrations order by version",
  );
  const applied = new Set(rows.map((row) => row.version));
  const missing = onDisk.filter((version) => !applied.has(version));

  if (missing.length === 0) {
    console.log(`All ${onDisk.length} migrations are applied.`);
    process.exit(0);
  }

  console.error(`${missing.length} of ${onDisk.length} migrations are NOT applied:`);
  for (const version of missing) {
    const file = fs.readdirSync(migrationsDir).find((name) => name.startsWith(`${version}_`));
    console.error(`  ${version}  ${file ?? "(file not found)"}`);
  }
  console.error("");
  console.error("Locally this usually means `supabase start` reused a stale Docker volume.");
  console.error("Run `npx supabase db reset` to apply every migration from scratch.");
  process.exit(1);
} catch (error) {
  console.error(`Could not verify migrations: ${error.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
