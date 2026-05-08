// scripts/verify-tour-targets.ts
//
// Loads the client tour registry, collects every data-tour-id referenced by
// any step, then greps client/src for data-tour-id="..." attributes.
// Fails with non-zero exit if any referenced target is missing.

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

import { listAllTargets } from "../client/src/tours/registry";

const ROOT = "client/src";
const FILE_EXTS = new Set([".ts", ".tsx", ".jsx"]);
const ATTR_RE = /data-tour-id\s*=\s*["']([^"']+)["']/g;

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (FILE_EXTS.has(extname(name))) out.push(p);
  }
}

function collectPresent(): Set<string> {
  const files: string[] = [];
  walk(ROOT, files);
  const present = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    let m: RegExpExecArray | null;
    while ((m = ATTR_RE.exec(src)) !== null) {
      present.add(m[1]);
    }
  }
  return present;
}

function main() {
  const referenced = listAllTargets();
  const present = collectPresent();
  const missing = referenced.filter((t) => !present.has(t));

  if (missing.length > 0) {
    console.error("Tour-target verification FAILED. Missing data-tour-id values:");
    for (const m of missing) console.error("  -", m);
    process.exit(1);
  }
  console.log(`Tour-target verification OK (${referenced.length} targets, all present).`);
}

main();
