#!/usr/bin/env tsx
/**
 * Lists every name exported from the schema, values and types alike.
 *
 * Why this exists: B4 splits `shared/schema.ts` into domain modules behind a
 * barrel. The whole point is that no consumer changes, and 147 files import from
 * it. A dropped or renamed export is silent until something fails at runtime, and
 * `tsc` will not catch an export that nothing happens to reference today.
 *
 * Capture the surface before the move, compare after, and the move is either
 * identical or it is not.
 *
 * Type exports cannot be read by importing the module, because types are erased.
 * This walks the TypeScript AST instead, so `export type Foo` counts the same as
 * `export const foo`.
 *
 * Usage:
 *   npx tsx scripts/schemaExportSurface.ts > before.txt
 *   npx tsx scripts/schemaExportSurface.ts --check before.txt
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(repoRoot, "shared", "schema.ts");

/** Collects exported names from a file and every file it re-exports from. */
function collect(file: string, seen = new Set<string>(), names = new Set<string>()): Set<string> {
  if (seen.has(file) || !fs.existsSync(file)) return names;
  seen.add(file);

  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

  function resolve(spec: string): string | null {
    if (!spec.startsWith(".")) return null;
    const base = path.resolve(path.dirname(file), spec);
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
      if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
    }
    return null;
  }

  source.forEachChild((node) => {
    // `export * from "./x"` and `export { a, b } from "./x"`
    if (ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      const target = spec && ts.isStringLiteral(spec) ? resolve(spec.text) : null;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) names.add(el.name.text);
      } else if (target) {
        collect(target, seen, names);
      }
      return;
    }

    const isExported = ts
      .getModifiers(node as ts.HasModifiers)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) return;

    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name
    ) {
      names.add(node.name.text);
    }
  });

  return names;
}

const surface = [...collect(entry)].sort();

const checkIndex = process.argv.indexOf("--check");
if (checkIndex === -1) {
  console.log(surface.join("\n"));
  process.exit(0);
}

const baselinePath = process.argv[checkIndex + 1];
if (!baselinePath) {
  console.error("--check needs a baseline file.");
  process.exit(1);
}

const baseline = fs
  .readFileSync(baselinePath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

const before = new Set(baseline);
const after = new Set(surface);
const removed = baseline.filter((n) => !after.has(n));
const added = surface.filter((n) => !before.has(n));

if (removed.length === 0 && added.length === 0) {
  console.log(`Export surface unchanged. ${surface.length} exports.`);
  process.exit(0);
}

if (removed.length > 0) {
  console.error(`${removed.length} exports REMOVED:`);
  for (const n of removed) console.error(`  ${n}`);
}
if (added.length > 0) {
  console.error(`${added.length} exports added:`);
  for (const n of added) console.error(`  ${n}`);
}
console.error("\nA split must not change the surface. 147 files import this module.");
process.exit(1);
