#!/usr/bin/env node
/**
 * Runs every gate that a B4 schema-module extraction has to pass.
 *
 * Why this exists: the same five checks run after each of the eight modules, and
 * running them by hand invites skipping the slow one. The SQL comparison is the
 * one that actually proves the database cannot tell the difference, and it is
 * also the most tedious, so it is the one most likely to get dropped.
 *
 * Gate 2 compares generated SQL from HEAD against the working tree. It sorts the
 * statements before comparing, because Drizzle emits tables in declaration order
 * and a split changes that order without changing the schema.
 *
 * Usage: node scripts/verifySchemaSplit.mjs [--skip-tests]
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipTests = process.argv.includes("--skip-tests");
const results = [];

function run(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      ...opts,
    });
    return { ok: true, out };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

// Gate 1: the export surface must be byte-identical to the pre-split baseline.
{
  const r = run("npx", [
    "tsx",
    "scripts/schemaExportSurface.ts",
    "--check",
    ".audit/B4/schema-exports-before.txt",
  ]);
  record("export surface", r.ok, r.out.trim().split("\n")[0]);
}

// Gate 2: generated SQL must describe the same database.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "b4-"));
  const headFile = path.join(repoRoot, "shared", "__b4_head.ts");
  const env = { ...process.env, DATABASE_URL: "postgresql://u:p@127.0.0.1:1/none" };
  let detail = "";
  let ok = false;

  try {
    fs.writeFileSync(headFile, run("git", ["show", "HEAD:shared/schema.ts"]).out);
    const gen = (schema, out) =>
      run(
        "npx",
        ["drizzle-kit", "generate", `--out=${out}`, `--schema=${schema}`, "--dialect=postgresql"],
        { env },
      );
    gen("./shared/__b4_head.ts", path.join(tmp, "old"));
    gen("./shared/schema.ts", path.join(tmp, "new"));

    const statements = (dir) => {
      const file = fs.readdirSync(dir).find((n) => n.endsWith(".sql"));
      if (!file) return null;
      return fs
        .readFileSync(path.join(dir, file), "utf8")
        .split("--> statement-breakpoint")
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .sort();
    };

    const before = statements(path.join(tmp, "old"));
    const after = statements(path.join(tmp, "new"));
    if (!before || !after) {
      detail = "could not generate SQL from one side";
    } else {
      const missing = before.filter((s) => !after.includes(s));
      const extra = after.filter((s) => !before.includes(s));
      ok = missing.length === 0 && extra.length === 0 && before.length === after.length;
      detail = `${before.length} statements before, ${after.length} after`;
      if (!ok) {
        detail += `\n      ${missing.length} missing, ${extra.length} added`;
        for (const s of [...missing.slice(0, 3), ...extra.slice(0, 3)]) {
          detail += `\n      ${s.slice(0, 120)}`;
        }
      }
    }
  } finally {
    fs.rmSync(headFile, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  record("generated SQL", ok, detail);
}

// Gates 3 to 5: the project's own checks.
for (const [name, script] of [
  ["typecheck", "check"],
  ["lint", "lint"],
  ["format", "format:check"],
]) {
  const r = run("npm", ["run", script, "--silent"]);
  record(name, r.ok, r.ok ? "" : r.out.trim().split("\n").slice(-2).join(" "));
}

if (!skipTests) {
  const r = run("npm", ["test", "--silent", "--", "--maxWorkers=1"]);
  const line = r.out.split("\n").find((l) => l.includes("Tests ")) ?? "";
  record("tests", r.ok, line.trim());
}

const failed = results.filter((r) => !r.ok);
console.log("");
if (failed.length === 0) {
  console.log(`All ${results.length} gates pass. The split is safe to commit.`);
  process.exit(0);
}
console.log(
  `${failed.length} of ${results.length} gates FAILED: ${failed.map((f) => f.name).join(", ")}`,
);
process.exit(1);
