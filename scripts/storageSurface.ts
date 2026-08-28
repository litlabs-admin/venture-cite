#!/usr/bin/env tsx
/**
 * Captures the storage layer's method surface and the body of every method.
 *
 * Why this exists: B5 splits a 5,251-line `DatabaseStorage` class into domain
 * modules and composes them back into one `storage` object. Three things can go
 * wrong silently, and none of them are caught by `tsc`:
 *
 * 1. A method is dropped. `IStorage` declares 307 methods; if an implementation
 *    goes missing the object literal simply fails to satisfy the interface, which
 *    tsc does catch, but only if the interface is still complete. If a method is
 *    dropped from BOTH, nothing complains and callers break at runtime.
 * 2. Two domain modules define the same method name. Object spread resolves that
 *    silently: last one wins, and the loser's behaviour disappears.
 * 3. A method body changes during the move. A pure move must not alter behaviour,
 *    and a diff of a 5,000-line file is unreadable, so a per-method comparison is
 *    the only practical check.
 *
 * Bodies are compared with whitespace collapsed so reformatting does not raise a
 * false alarm, but any real edit does.
 *
 * Usage:
 *   npx tsx scripts/storageSurface.ts > before.json
 *   npx tsx scripts/storageSurface.ts --check before.json
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Surface = {
  interfaceMethods: string[];
  implementations: Record<string, { body: string; source: string }>;
  duplicates: Array<{ name: string; sources: string[] }>;
};

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

function objectLiteralInitializer(
  initializer: ts.Expression,
): ts.ObjectLiteralExpression | undefined {
  let expression = initializer;
  while (
    ts.isAsExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    expression = expression.expression;
  }
  return ts.isObjectLiteralExpression(expression) ? expression : undefined;
}

/** Collapses whitespace so formatting churn does not read as a behaviour change. */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Method names declared on `interface IStorage`. */
function interfaceMethods(): string[] {
  const source = parse(path.join(repoRoot, "server", "storage.ts"));
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === "IStorage") {
      for (const member of node.members) {
        if (
          (ts.isMethodSignature(member) || ts.isPropertySignature(member)) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          names.push(member.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names.sort();
}

/**
 * Every method implementation reachable from the storage layer, whether it lives
 * on the `DatabaseStorage` class or in a plain object literal such as
 * `export const brandStorage = { ... }`. Both shapes are in use.
 */
function implementations(): {
  map: Record<string, { body: string; source: string }>;
  dupes: Array<{ name: string; sources: string[] }>;
} {
  const files = [
    path.join(repoRoot, "server", "databaseStorage.ts"),
    ...fs
      .readdirSync(path.join(repoRoot, "server", "storage"), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .map((e) => path.join(repoRoot, "server", "storage", e.name)),
  ].filter((f) => fs.existsSync(f));

  const map: Record<string, { body: string; source: string }> = {};
  const seen = new Map<string, string[]>();

  for (const file of files) {
    const rel = path.relative(repoRoot, file).split(path.sep).join("/");
    const source = parse(file);

    const record = (name: string, body: string): void => {
      seen.set(name, [...(seen.get(name) ?? []), rel]);
      map[name] = { body: normalise(body), source: rel };
    };

    const visit = (node: ts.Node): void => {
      // class DatabaseStorage { async foo() { ... } }
      if (ts.isClassDeclaration(node)) {
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
            record(member.name.text, member.body ? member.body.getText(source) : "");
          }
        }
      }
      // export const fooStorage = { async bar() { ... } }
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (!decl.initializer) continue;
          const initializer = objectLiteralInitializer(decl.initializer);
          if (!initializer) continue;
          for (const prop of initializer.properties) {
            if (ts.isMethodDeclaration(prop) && prop.name && ts.isIdentifier(prop.name)) {
              record(prop.name.text, prop.body ? prop.body.getText(source) : "");
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  const dupes = [...seen.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([name, sources]) => ({ name, sources }));

  return { map, dupes };
}

const { map, dupes } = implementations();
const surface: Surface = {
  interfaceMethods: interfaceMethods(),
  implementations: map,
  duplicates: dupes,
};

const checkIndex = process.argv.indexOf("--check");
if (checkIndex === -1) {
  console.log(JSON.stringify(surface, null, 1));
  process.exit(0);
}

const baselinePath = process.argv[checkIndex + 1];
if (!baselinePath) {
  console.error("--check needs a baseline file.");
  process.exit(1);
}

const before: Surface = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const problems: string[] = [];

// 1. The interface must not change. 60 files depend on it.
const ifaceRemoved = before.interfaceMethods.filter((m) => !surface.interfaceMethods.includes(m));
const ifaceAdded = surface.interfaceMethods.filter((m) => !before.interfaceMethods.includes(m));
if (ifaceRemoved.length)
  problems.push(`IStorage lost ${ifaceRemoved.length} methods: ${ifaceRemoved.join(", ")}`);
if (ifaceAdded.length)
  problems.push(`IStorage gained ${ifaceAdded.length} methods: ${ifaceAdded.join(", ")}`);

// 2. Nothing may be implemented twice. Object spread resolves a clash silently.
if (surface.duplicates.length) {
  for (const d of surface.duplicates) {
    problems.push(
      `"${d.name}" is implemented in ${d.sources.length} files: ${d.sources.join(", ")}`,
    );
  }
}

// 3. Every method must still exist, with an unchanged body.
const beforeNames = Object.keys(before.implementations);
const afterNames = Object.keys(surface.implementations);
const implRemoved = beforeNames.filter((m) => !afterNames.includes(m));
const implAdded = afterNames.filter((m) => !beforeNames.includes(m));
if (implRemoved.length)
  problems.push(
    `${implRemoved.length} implementations disappeared: ${implRemoved.slice(0, 10).join(", ")}`,
  );
if (implAdded.length)
  problems.push(
    `${implAdded.length} implementations appeared: ${implAdded.slice(0, 10).join(", ")}`,
  );

const changed = beforeNames
  .filter((m) => afterNames.includes(m))
  .filter((m) => before.implementations[m].body !== surface.implementations[m].body);
if (changed.length) {
  problems.push(
    `${changed.length} method bodies changed during a move that should not alter behaviour:`,
  );
  for (const m of changed.slice(0, 10)) {
    problems.push(
      `    ${m}  (${before.implementations[m].source} -> ${surface.implementations[m].source})`,
    );
  }
}

const moved = beforeNames
  .filter((m) => afterNames.includes(m))
  .filter((m) => before.implementations[m].source !== surface.implementations[m].source).length;

if (problems.length === 0) {
  console.log(
    `Storage surface intact. ${surface.interfaceMethods.length} interface methods, ` +
      `${afterNames.length} implementations, ${moved} relocated, no duplicates, no body changed.`,
  );
  process.exit(0);
}

for (const p of problems) console.error(p);
console.error(
  "\nA decomposition must not change the interface, duplicate a method, or edit a body.",
);
process.exit(1);
