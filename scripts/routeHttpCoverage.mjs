// Measure how many Express route registrations have an HTTP-level test.
//
// Why this exists: the B7 service extraction moved business logic out of the
// route files, and every unit test written against a service passes whether or
// not the route wires it up correctly. Two real defects lived in that gap - the
// article-generate handler stopped answering 409 for a non-draft article
// because the body parse moved ahead of the status check, and the geo-signals
// handler answered 500 instead of 404 for a brand the caller does not own.
// Neither is visible to a service-level test.
//
// "Covered" here means only that some supertest-based test calls that method
// and path. It does not mean the endpoint is well tested. It is a floor, not a
// score.
//
// It also UNDERCOUNTS, and in a way worth knowing before chasing a gap. The
// scan matches a literal `.get("/api/…")` in a file that mentions supertest, so
// a test driving a route another way is invisible to it. That is not
// hypothetical: GET /api/brand-fact-sheet/runs/:runId/stream read as uncovered
// for a while, and tests/unit/factSheetSseStream.test.ts had been exercising it
// against a raw http.Server the whole time - necessarily so, because an SSE
// endpoint that never ends its response cannot be driven by supertest's
// resolve-on-end contract.
//
// So a route reported uncovered is a prompt to go and look, not proof that
// nothing tests it.
//
// Run: node scripts/routeHttpCoverage.mjs [--json]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROUTE_DIR = "server/routes";
const TEST_DIR = "tests";

export function routeRegistrations(routeDir = ROUTE_DIR) {
  const registrations = [];
  for (const file of fs.readdirSync(routeDir).filter((name) => name.endsWith(".ts"))) {
    const text = fs.readFileSync(path.join(routeDir, file), "utf8");
    const pattern = /\bapp\.(get|post|put|patch|delete)\(\s*\n?\s*["'`]([^"'`]+)["'`]/g;
    let match;
    while ((match = pattern.exec(text))) {
      registrations.push({ file, method: match[1].toUpperCase(), route: match[2] });
    }
  }
  return registrations;
}

export function testedPaths(testDir = TEST_DIR) {
  const called = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, "utf8");
      // Only supertest files drive the real HTTP layer.
      if (!text.includes("supertest")) continue;
      const pattern = /\.(get|post|put|patch|delete)\(\s*[`"']([^`"']*\/api\/[^`"']*)[`"']/g;
      let match;
      while ((match = pattern.exec(text))) {
        called.push({ method: match[1].toUpperCase(), path: match[2] });
      }
    }
  };
  walk(testDir);
  return called;
}

export function measureRouteHttpCoverage(routeDir = ROUTE_DIR, testDir = TEST_DIR) {
  const registrations = routeRegistrations(routeDir);
  const called = testedPaths(testDir);

  const matcher = (route) => new RegExp("^" + route.replace(/:[A-Za-z0-9_]+/g, "[^/]+") + "/?$");

  const covered = [];
  const uncovered = [];
  for (const registration of registrations) {
    const pattern = matcher(registration.route);
    const hit = called.some((call) => {
      // Tests build paths with template literals; treat any interpolation as a
      // single path segment so `/api/brands/${id}` matches `/api/brands/:id`.
      const bare = call.path.split("?")[0].replace(/\$\{[^}]*\}/g, "x");
      return call.method === registration.method && pattern.test(bare);
    });
    (hit ? covered : uncovered).push(registration);
  }
  return { registrations, covered, uncovered };
}

// fileURLToPath rather than string-comparing the URL: on Windows import.meta.url
// is file:///C:/... and a hand-built file://C:/... never matches.
const invokedDirectly =
  process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  const { registrations, covered, uncovered } = measureRouteHttpCoverage();
  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify({ total: registrations.length, covered: covered.length, uncovered }, null, 2),
    );
  } else {
    console.log(`route registrations:            ${registrations.length}`);
    console.log(`with an HTTP-level test:        ${covered.length}`);
    console.log(`without:                        ${uncovered.length}`);
    const byFile = {};
    for (const item of uncovered) (byFile[item.file] ??= []).push(`${item.method} ${item.route}`);
    console.log("\nuncovered, by route file:");
    for (const [file, list] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${file.padEnd(26)} ${list.length}`);
    }
  }
}
