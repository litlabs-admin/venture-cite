import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { PAYING_TIERS } from "../../shared/schema";
import { citationScanQuery, activationSweepQuery } from "../../server/lib/payingTiersQuery";

// Regression test for a bug where PAYING_TIERS (a plain JS string[]) was
// interpolated directly into a drizzle sql`` template:
//   sql`... = ANY(${PAYING_TIERS})`
// Drizzle expands an interpolated array into a row expression, rendering
// `ANY(($1, $2, $3, ...))`, which Postgres rejects with a syntax error.
// The fix binds the array as a single text[] parameter via `sql.param`:
//   sql`... = ANY(${sql.param(PAYING_TIERS)}::text[])`
// which renders `ANY($1::text[])` with PAYING_TIERS bound as one parameter.
//
// citationScanQuery/activationSweepQuery build the sql`` fragment used by
// selectBrandsForCitationScan (server/scheduler.ts) and
// runBrandActivationSweep (server/lib/brandActivation.ts) respectively; both
// modules import the query builders from here so this test can render the
// real queries with PgDialect.sqlToQuery, without a live database and
// without needing to mock either module's (large) dependency graph.
function render(fragment: SQL): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(fragment);
  return { sql: query.sql, params: query.params };
}

describe("PAYING_TIERS queries bind the array as one parameter", () => {
  it("selectBrandsForCitationScan's query renders ANY($1::text[])", () => {
    const { sql, params } = render(citationScanQuery());

    expect(sql).toMatch(/any\(\$\d+::text\[\]\)/i);
    expect(sql).not.toMatch(/any\(\(\$\d+,\s*\$\d+/i);
    expect(params).toContainEqual(PAYING_TIERS);
  });

  it("runBrandActivationSweep's query renders ANY($1::text[])", () => {
    const { sql, params } = render(activationSweepQuery());

    expect(sql).toMatch(/any\(\$\d+::text\[\]\)/i);
    expect(sql).not.toMatch(/any\(\(\$\d+,\s*\$\d+/i);
    expect(params).toContainEqual(PAYING_TIERS);
  });
});
