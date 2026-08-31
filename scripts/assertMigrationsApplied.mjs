#!/usr/bin/env node
/**
 * Fails when the target database has not applied every migration in
 * `supabase/migrations/`, or when a handful of objects the most recent
 * migrations create are missing from the live schema.
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
 * The ledger-only check has a gap: it reported "All 133 migrations are
 * applied" against a database whose role grants were actually missing — the
 * ledger row for a migration exists once the migration runs, even if a later
 * manual change (or a runner that swallowed part of a DO block) leaves the
 * schema it was supposed to produce in a different state. The structural
 * checks below catch that class of drift for a few specific objects. They do
 * NOT verify the whole schema — only that these named objects exist.
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

// Cheap, targeted structural checks, one per recent migration that creates a
// concrete object. This is not schema verification — it is a small sample
// that would have caught the 2026-08-31 case (ledger complete, role grants
// missing).
const structuralChecks = [
  {
    description: "role venturecite_entity_request exists (migration 0124)",
    sql: "select 1 from pg_roles where rolname = 'venturecite_entity_request'",
  },
  {
    description: "public.job_leases has row level security enabled (migration 0124)",
    sql: "select 1 from pg_class where oid = 'public.job_leases'::regclass and relrowsecurity",
  },
  {
    description: "venturecite_entity_request carries a SET-able membership (migration 0125)",
    sql: `select 1
          from pg_auth_members membership
          join pg_roles granted on granted.oid = membership.roleid
          where granted.rolname = 'venturecite_entity_request'
            and membership.set_option`,
  },
];

const client = new pg.Client({ connectionString, ssl: false });

try {
  await client.connect();
  const { rows } = await client.query(
    "select version from supabase_migrations.schema_migrations order by version",
  );
  const applied = new Set(rows.map((row) => row.version));
  const missing = onDisk.filter((version) => !applied.has(version));

  if (missing.length > 0) {
    console.error(`${missing.length} of ${onDisk.length} migrations are NOT applied:`);
    for (const version of missing) {
      const file = fs.readdirSync(migrationsDir).find((name) => name.startsWith(`${version}_`));
      console.error(`  ${version}  ${file ?? "(file not found)"}`);
    }
    console.error("");
    console.error("Locally this usually means `supabase start` reused a stale Docker volume.");
    console.error("Run `npx supabase db reset` to apply every migration from scratch.");
    process.exit(1);
  }

  console.log(`All ${onDisk.length} migrations are applied.`);

  const structuralFailures = [];
  for (const check of structuralChecks) {
    const result = await client.query(check.sql);
    if (result.rowCount === 0) structuralFailures.push(check.description);
  }

  if (structuralFailures.length > 0) {
    console.error("");
    console.error(
      `${structuralFailures.length} structural check(s) failed even though the migration ledger is complete:`,
    );
    for (const description of structuralFailures) {
      console.error(`  - ${description}`);
    }
    console.error("");
    console.error(
      "The ledger says these migrations ran, but the objects they should have created are " +
        "missing. Reset the database rather than trusting the ledger.",
    );
    process.exit(1);
  }

  console.log(`All ${structuralChecks.length} structural checks passed.`);
  process.exit(0);
} catch (error) {
  console.error(`Could not verify migrations: ${error.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
