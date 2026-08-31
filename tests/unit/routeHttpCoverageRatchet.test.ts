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

// Measured on 2026-08-31: 153 of 240 registrations, up from 31 after
// prompts, contentTypes, dashboard, articles and intelligence gained
// end-to-end tests. The remaining 87 are a real, recorded gap - this is not an
// assertion that they are safe.
const BASELINE_COVERED = 153;

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

  it("reports the outstanding gap rather than hiding it", () => {
    // Not an assertion about quality - just proof the gap is measured. The
    // number is large on purpose; see the file header.
    expect(uncovered.length).toBeGreaterThan(0);
    expect(covered.length + uncovered.length).toBe(registrations.length);
  });
});
