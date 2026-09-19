import { sql } from "drizzle-orm";
import { PAYING_TIERS } from "@shared/schema";

// Both the weekly citation scan (server/scheduler.ts) and the brand
// activation sweep (server/lib/brandActivation.ts) select brands whose owner
// is entitled to paid work. Kept here, isolated from either module's own
// (heavy) import graph, so tests/unit/payingTiersQuery.test.ts can render the
// real queries with PgDialect without needing a live database.
//
// PAYING_TIERS is a plain JS string[]. Drizzle's sql`` template expands an
// interpolated array into a row expression - `ANY(${PAYING_TIERS})` renders
// as `ANY(($1, $2, $3, ...))`, which Postgres rejects. Binding it with
// `sql.param` instead renders `ANY($1::text[])`, a single array parameter.

export function citationScanQuery() {
  return sql`
    SELECT b.*
    FROM brands b
    JOIN users u ON u.id = b.user_id
    WHERE b.deleted_at IS NULL
      AND u.access_tier = ANY(${sql.param(PAYING_TIERS)}::text[])
  `;
}

export function activationSweepQuery() {
  return sql`
    SELECT b.id
    FROM brands b
    JOIN users u ON u.id = b.user_id
    WHERE b.deleted_at IS NULL
      AND u.access_tier = ANY(${sql.param(PAYING_TIERS)}::text[])
    ORDER BY b.created_at ASC
  `;
}
