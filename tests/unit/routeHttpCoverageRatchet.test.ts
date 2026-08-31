// A ratchet on HTTP-level route coverage.
//
// The B7 service extraction moved logic out of the route files. Service-level
// unit tests pass whether or not the route wires the service up correctly, and
// two real defects lived in exactly that gap: the article-generate handler
// stopped answering 409 for a non-draft article once the body parse moved ahead
// of the status check, and the geo-signals handler answered 500 rather than 404
// for a brand the caller does not own.
//
// Most registrations still have no HTTP-level test. That is a known, recorded
// gap rather than a claim of safety, and this test exists so the number is
// visible in CI instead of buried in an audit document that goes stale.
//
// The rule is one-directional: coverage may rise, never fall. Raise BASELINE
// when you add tests. If this fails because BASELINE is now too low, that is
// the good failure - update it.
//
// "Covered" means only that some supertest test calls that method and path. It
// is not a quality measure.

import { describe, expect, it } from "vitest";
import { measureRouteHttpCoverage } from "../../scripts/routeHttpCoverage.mjs";

// Measured on 2026-09-01: 240 of 240 registrations, up from 31 at the start of
// the pass.
//
// The last one to close, GET /api/brand-fact-sheet/runs/:runId/stream, is worth
// remembering: it read as uncovered while tests/unit/factSheetSseStream.test.ts
// had been driving it against a raw http.Server all along. The scanner only
// sees a literal `.get("/api/…")` in a supertest file, and an SSE endpoint that
// never ends its response cannot be driven that way. The number went up because
// the resolvable branches - the pre-flush 404 and a terminal run - gained
// supertest tests, not because the endpoint went from untested to tested.
//
// So this is a floor twice over: "covered" means only that some test calls that
// method and path, and the scan can miss tests that drive a route another way.
const BASELINE_COVERED = 240;

describe("HTTP-level route coverage", () => {
  const { registrations, covered, uncovered } = measureRouteHttpCoverage();

  it("finds the route registrations at all, so a broken scan cannot pass as coverage", () => {
    // If the scan silently matched nothing, every other assertion here would be
    // vacuous. Pin a floor well below the real count.
    expect(registrations.length).toBeGreaterThan(150);
  });

  it("does not regress below the recorded baseline", () => {
    expect(covered.length).toBeGreaterThanOrEqual(BASELINE_COVERED);
  });

  it("keeps the two endpoints whose contracts regressed under test", () => {
    const pairs = covered.map((entry) => `${entry.method} ${entry.route}`);
    expect(pairs).toContain("POST /api/articles/:id/generate");
    expect(pairs).toContain("POST /api/geo-signals/optimize-chunks");
  });

  it("accounts for every registration, covered or not", () => {
    // This used to assert `uncovered.length > 0` - written when 209 were
    // uncovered and a gap was a safe thing to assume. It became false at
    // 240/240 and failed, which is the right way round: an invariant that
    // encodes "there is still work left" expires the moment the work is done.
    //
    // What is worth pinning is the accounting, not the shortfall: every
    // registration is classified exactly once, so a scan that quietly dropped
    // routes cannot read as full coverage.
    expect(covered.length + uncovered.length).toBe(registrations.length);
    expect(covered.length).toBe(registrations.length - uncovered.length);
  });
});
