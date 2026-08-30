// citation_runs mixes both timestamp flavours, and the difference is load
// bearing.
//
// started_at and completed_at predate the convention and are TIMESTAMP
// WITHOUT TIME ZONE in production (verified against the live database on
// 2026-08-31). last_advance_started_at was added by migration 0123 as
// TIMESTAMPTZ. Declaring it with a bare timestamp() - as it originally was -
// makes Drizzle serialise writes with no offset, so Postgres resolves them in
// the session time zone instead of UTC. That column is what the staleness
// reapers in server/lib/citationReconciliation.ts and
// server/citationChecker.ts compare against, so a shifted value either reaps
// a healthy run early or lets a dead one sit.
//
// tests/migrations/drizzleColumnTypeParity.test.ts checks this class of drift
// across the whole schema, but only when a database is available. This test
// pins the one column the bug was in, and runs everywhere.

import { describe, it, expect } from "vitest";
import { citationRuns } from "../../shared/schema/citations";

function sqlType(column: unknown): string {
  return (column as { getSQLType(): string }).getSQLType().toLowerCase();
}

describe("citation_runs timestamp declarations", () => {
  it("declares last_advance_started_at with a time zone, matching migration 0123", () => {
    expect(sqlType(citationRuns.lastAdvanceStartedAt)).toBe("timestamp with time zone");
  });

  it("leaves started_at and completed_at without one, matching the live columns", () => {
    expect(sqlType(citationRuns.startedAt)).toBe("timestamp");
    expect(sqlType(citationRuns.completedAt)).toBe("timestamp");
  });
});
