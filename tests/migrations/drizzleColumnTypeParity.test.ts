// Every Drizzle column declaration must agree with the column the migrations
// actually created.
//
// Why this exists: migration 0123 created
// citation_runs.last_advance_started_at as TIMESTAMPTZ, while
// shared/schema/citations.ts declared it with a bare timestamp(), which maps
// to TIMESTAMP WITHOUT TIME ZONE. Nothing caught it. tests/migrations/
// spec2Migrations.test.ts compares column NAMES only, and `tsc` cannot see
// into the database, so a declaration can disagree with its column
// indefinitely. A mismatched timezone flag makes Drizzle serialise writes
// without an offset, and Postgres then reads them in the session time zone
// rather than UTC.
//
// The check is deliberately whole-schema rather than one assertion about the
// column that was wrong: the defect is a class, not an instance.
//
// Connects to TEST_DATABASE_URL and skips when it is unset, matching the
// other tests in this directory.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { getTableName, getTableColumns, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../shared/schema";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);
const url = process.env.DATABASE_URL;
const describeIfDb = databaseTest.kind === "ready" ? describe : describe.skip;

type ColumnFact = { table: string; column: string; declared: string };

/** Every column Drizzle declares, flattened to (table, column, SQL type). */
function declaredColumns(): ColumnFact[] {
  const facts: ColumnFact[] = [];
  for (const exported of Object.values(schema)) {
    if (!is(exported, PgTable)) continue;
    const table = getTableName(exported);
    for (const [, column] of Object.entries(getTableColumns(exported))) {
      facts.push({
        table,
        column: column.name,
        declared: column.getSQLType().toLowerCase(),
      });
    }
  }
  return facts;
}

/**
 * Compare only the timezone-carrying half of the type.
 *
 * Full type equality would drown the signal in benign spellings that mean the
 * same column: varchar vs character varying, numeric(12,6) vs numeric, serial
 * vs integer with a default. The timezone flag is the part that silently
 * corrupts values, so that is what this asserts.
 */
function timestampKind(sqlType: string): "tz" | "notz" | null {
  if (!sqlType.startsWith("timestamp")) return null;
  return sqlType.includes("with time zone") ? "tz" : "notz";
}

describeIfDb("Drizzle declarations match the migrated columns", () => {
  let pool: Pool;
  let actual: Map<string, string>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    const result = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'`,
    );
    actual = new Map(
      result.rows.map((row) => [
        `${row.table_name}.${row.column_name}`,
        row.data_type.toLowerCase(),
      ]),
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("declares every timestamp column with the timezone flag the database uses", () => {
    const mismatches: string[] = [];

    for (const { table, column, declared } of declaredColumns()) {
      const declaredKind = timestampKind(declared);
      if (declaredKind === null) continue;

      const live = actual.get(`${table}.${column}`);
      // A declared table that does not exist in this database is a different
      // problem, and spec2Migrations.test.ts is where names are checked.
      if (live === undefined) continue;

      const liveKind = timestampKind(live);
      if (liveKind === null) {
        mismatches.push(`${table}.${column}: declared ${declared}, database has ${live}`);
        continue;
      }
      if (liveKind !== declaredKind) {
        mismatches.push(`${table}.${column}: declared "${declared}", database has "${live}"`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("covers a meaningful number of columns, so an empty pass cannot hide a broken query", () => {
    const timestampColumns = declaredColumns().filter(
      (c) => timestampKind(c.declared) !== null && actual.has(`${c.table}.${c.column}`),
    );
    expect(timestampColumns.length).toBeGreaterThan(50);
  });
});
