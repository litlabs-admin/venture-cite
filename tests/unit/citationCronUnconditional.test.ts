// Which brands the weekly citation scan is allowed to run for.
//
// Two invariants, and they have different histories:
//
//   1. No cadence gate. Foundations Plan 1 Task 11 removed the legacy
//      autoCitationSchedule / autoCitationActive flags - every live brand is
//      scanned weekly, gated only by "has it been ~6 days" in
//      isBrandDueForCitation.
//
//   2. Only brands whose owner is entitled to paid work. A citation run hits
//      four AI engines per prompt, every week, forever. Running it for
//      read-only accounts (a cancelled trial, a subscription that failed) is
//      the one thing that would make "downgrade instead of lock out"
//      expensive, and it would be invisible - a bigger LLM bill, no error.
//
// Deliberately a source-text check rather than a runtime one: the query is raw
// SQL joining users, so a mocked db.execute would only ever return whatever
// the mock was told to, proving nothing about the WHERE clause. Importing the
// real module to run the real query would need a live database. The invariant
// is a fact about the source, so the source is what gets asserted - the same
// reasoning as tests/unit/schedulerOrchestratorParity.test.ts.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PAYING_TIERS, usageLimits } from "@shared/schema";

const scheduler = readFileSync(
  fileURLToPath(new URL("../../server/scheduler.ts", import.meta.url)),
  "utf8",
);

/** The body of selectBrandsForCitationScan, isolated from the rest of the file. */
function selectorBody(): string {
  const start = scheduler.indexOf("export async function selectBrandsForCitationScan");
  expect(start, "selectBrandsForCitationScan not found - has it been renamed?").toBeGreaterThan(-1);
  const body = scheduler.slice(start, scheduler.indexOf("\n}", start));
  // Guard the extraction itself, so the assertions below cannot pass against
  // an empty string.
  expect(body.length).toBeGreaterThan(100);
  return body;
}

describe("citation scan selector", () => {
  it("skips soft-deleted brands", () => {
    expect(selectorBody()).toMatch(/deleted_at\s+IS\s+NULL/i);
  });

  it("skips brands whose owner is not entitled to paid work", () => {
    const body = selectorBody();
    // Joins the owner and filters on their tier. Without this, a read-only
    // account keeps consuming weekly citation runs at our expense.
    expect(body).toMatch(/join\s+users/i);
    expect(body).toContain("access_tier");
    expect(body).toContain("PAYING_TIERS");
  });

  it("has no cadence gate in the query", () => {
    // Cadence is decided per brand by isBrandDueForCitation, not in the
    // selector. The legacy flags must not creep back in here.
    const body = selectorBody();
    expect(body).not.toContain("auto_citation_schedule");
    expect(body).not.toContain("auto_citation_active");
  });

  it("excludes the non-paying states from PAYING_TIERS", () => {
    // The selector is only as correct as this list. pending = signed up with
    // no plan; readonly = lapsed. Neither may trigger paid work.
    expect(PAYING_TIERS).not.toContain("pending");
    expect(PAYING_TIERS).not.toContain("readonly");
    // ...and every tier it does contain must be a real one.
    for (const tier of PAYING_TIERS) {
      expect(usageLimits[tier as keyof typeof usageLimits], `${tier} has no limits`).toBeDefined();
    }
  });
});
