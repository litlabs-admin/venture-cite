#!/usr/bin/env tsx
/**
 * Compares the tables and columns declared in `shared/schema.ts` against the
 * tables and columns that actually exist in a database.
 *
 * Why this exists: on 2026-08-28 `shared/schema.ts` declared `brands.autopilot_attempts`
 * and `brands.autopilot_last_attempt_at` while the local database had neither,
 * because `supabase start` had reused a stale volume and skipped five migrations.
 * Every query naming those columns failed with an opaque 500. Nothing reported
 * the real cause, and four integration tests failed for a reason none of their
 * messages mentioned.
 *
 * This reads Drizzle's own table metadata rather than parsing `schema.ts` as
 * text. A regex over that file cannot tell where one `pgTable` call ends and the
 * next begins, so it silently merges columns across tables.
 *
 * Usage:
 *   TEST_DATABASE_URL=postgresql://... npx tsx scripts/checkSchemaDrift.ts
 *   npx tsx scripts/checkSchemaDrift.ts --ignore-extra
 *
 * `--ignore-extra` reports only columns the code expects and the database lacks.
 * Use it against a database that legitimately carries tables this app does not
 * own, such as Supabase's own schemas.
 */

import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "../shared/schema";

type ColumnKey = `${string}.${string}`;

const ignoreExtra = process.argv.includes("--ignore-extra");
const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Set TEST_DATABASE_URL or DATABASE_URL before running this check.");
  process.exit(1);
}

function declaredColumns(): Map<ColumnKey, string> {
  const declared = new Map<ColumnKey, string>();
  for (const exported of Object.values(schema)) {
    if (!(exported instanceof PgTable)) continue;
    const config = getTableConfig(exported as PgTable);
    for (const column of config.columns) {
      declared.set(`${config.name}.${column.name}`, column.getSQLType());
    }
  }
  return declared;
}

async function actualColumns(client: pg.Client): Promise<Map<ColumnKey, string>> {
  const { rows } = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(
    `select table_name, column_name, data_type
       from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position`,
  );
  const actual = new Map<ColumnKey, string>();
  for (const row of rows) {
    actual.set(`${row.table_name}.${row.column_name}`, row.data_type);
  }
  return actual;
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();

  try {
    const declared = declaredColumns();
    const actual = await actualColumns(client);

    const missingInDatabase = [...declared.keys()].filter((key) => !actual.has(key)).sort();
    const missingInCode = [...actual.keys()].filter((key) => !declared.has(key)).sort();

    const declaredTables = new Set([...declared.keys()].map((key) => key.split(".")[0]));
    console.log(
      `Declared: ${declaredTables.size} tables, ${declared.size} columns. ` +
        `Database: ${new Set([...actual.keys()].map((k) => k.split(".")[0])).size} tables, ${actual.size} columns.`,
    );

    if (missingInDatabase.length > 0) {
      console.error(
        `\n${missingInDatabase.length} columns declared in code but ABSENT from the database:`,
      );
      for (const key of missingInDatabase) console.error(`  ${key}  (${declared.get(key)})`);
      console.error("\nAny query naming these fails at runtime.");
      console.error(
        "Locally this usually means migrations did not all apply. Run `npx supabase db reset`.",
      );
    }

    if (missingInCode.length > 0 && !ignoreExtra) {
      console.error(
        `\n${missingInCode.length} columns in the database but NOT declared in shared/schema.ts:`,
      );
      for (const key of missingInCode) console.error(`  ${key}  (${actual.get(key)})`);
      console.error("\nThese are either dead or written by something outside the schema file.");
    }

    const failed = missingInDatabase.length > 0 || (missingInCode.length > 0 && !ignoreExtra);
    if (!failed) {
      console.log("No drift. Every declared column exists, and nothing unexpected is present.");
      return;
    }
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

await main();
