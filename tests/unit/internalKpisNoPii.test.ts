// server/routes/internalKpis.ts is public (see server/auth.ts's
// PUBLIC_API_ROUTES, "GET /api/internal/kpis") because /internal-page has no
// sign-in - see client/src/pages/internal-page.tsx. Its own file header
// states a hard guarantee: "aggregate counts only... never emails, names,
// ids, stripe ids, or any other per-user/per-row data."
//
// This test locks that guarantee in code rather than leaving it as a comment
// someone could violate by adding one field. It mounts the real route
// handler (only `server/db` and the OpenAI-instantiating routesShared
// module are stubbed) and asserts every value the response ever sends is a
// plain number, and no key name suggests an identifier.
//
// Written for B8 (.audit/B7/B7-08-orphaned-pages.md), which re-verified this
// route's no-PII claim against its actual SELECT list as part of resolving
// the orphaned /internal-page and /admin/scrape claims from an earlier,
// partly-stale audit.

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

// Drizzle fluent-chain stub: every method (from/where/groupBy) returns an
// awaitable proxy resolving to one fixed row. That row carries every field
// any of internalKpis.ts's twelve queries destructures (`n`, `tier`,
// `status`, `d7`, `d30`), so it works for both the single-row count queries
// and the grouped ones - this test only cares about the response's key
// names and value types, not the arithmetic.
const ROW = { n: 3, tier: "pro", status: "completed", d7: 1, d30: 2 };

function chain() {
  function fn(): unknown {
    return proxy;
  }
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve([ROW]);
        if (prop === "catch" || prop === "finally") {
          return Promise.resolve([ROW])[prop as "catch" | "finally"].bind(Promise.resolve([ROW]));
        }
        return fn;
      },
    },
  );
  return proxy;
}

vi.mock("../../server/db", () => ({
  db: { select: mockSelect },
}));

// internalKpis.ts imports asyncHandler from "../lib/routesShared", which
// instantiates a module-level OpenAI client this test has no key for.
// Stub with the real, trivial implementation (server/lib/asyncHandler.ts).
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler:
    (fn: (req: express.Request, res: express.Response, next: express.NextFunction) => unknown) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    },
}));

const { setupInternalKpisRoutes } = await import("../../server/routes/internalKpis");

function makeApp() {
  mockSelect.mockImplementation(() => chain());
  const app = express();
  setupInternalKpisRoutes(app);
  return app;
}

// Recursively collect every leaf value and every key name in a JSON value.
function walk(value: unknown, keys: string[], leaves: unknown[]) {
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      keys.push(k);
      walk(v, keys, leaves);
    }
  } else {
    leaves.push(value);
  }
}

const PII_KEY_PATTERN = /email|stripeCustomerId|stripeSubscriptionId|(?<!brand)id$|name$/i;

describe("GET /api/internal/kpis - no-PII guarantee", () => {
  it("returns 200 with only aggregate data", async () => {
    const response = await request(makeApp()).get("/api/internal/kpis");
    expect(response.status).toBe(200);
  });

  it("every leaf value in the response is a plain number, never a string or id", async () => {
    const response = await request(makeApp()).get("/api/internal/kpis");
    const keys: string[] = [];
    const leaves: unknown[] = [];
    walk(response.body, keys, leaves);

    expect(leaves.length).toBeGreaterThan(0);
    for (const leaf of leaves) {
      expect(typeof leaf).toBe("number");
    }
  });

  it("no key name in the response suggests a per-row identifier", async () => {
    const response = await request(makeApp()).get("/api/internal/kpis");
    const keys: string[] = [];
    const leaves: unknown[] = [];
    walk(response.body, keys, leaves);

    const offending = keys.filter((k) => PII_KEY_PATTERN.test(k));
    expect(offending).toEqual([]);
  });

  it("known-safe response shape - the exact top-level keys this route promises", async () => {
    const response = await request(makeApp()).get("/api/internal/kpis");
    expect(Object.keys(response.body).sort()).toEqual(
      [
        "totalUsers",
        "activeBrands",
        "usersByTier",
        "payingUsers",
        "payingByTier",
        "signups7d",
        "signups30d",
        "totalArticles",
        "totalPrompts",
        "totalCitationRuns",
        "citationRunsByStatus",
        "totalCitationChecks",
        "citedChecks",
      ].sort(),
    );
  });
});
