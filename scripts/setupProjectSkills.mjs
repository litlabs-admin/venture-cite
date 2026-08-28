#!/usr/bin/env node
/**
 * Generates `.claude/skills/` from the curated list in `.agents/project-skills.json`.
 *
 * Why this script exists: this repository is developed on Windows with
 * `core.symlinks=false`. Git checks a committed symlink out as a plain text file
 * containing the target path, so committing `.claude/skills/` would not survive a
 * clone here. The source of truth is `.agents/skills/` plus this script.
 *
 * Usage:
 *   node scripts/setupProjectSkills.mjs           Regenerate the links.
 *   node scripts/setupProjectSkills.mjs --check    Exit non-zero when out of sync.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(repoRoot, ".agents", "project-skills.json");
const checkOnly = process.argv.includes("--check");

/** @returns {{source: string, target: string, names: string[]}} */
function readConfig() {
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const names = Object.values(raw.skills).flat();
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate skill names in project-skills.json: ${duplicates.join(", ")}`);
  }
  return { source: raw.source, target: raw.target, names: names.sort() };
}

/**
 * Links one skill directory. Prefers a symlink. Falls back to a copy when the
 * platform refuses symlink creation, which happens on Windows without Developer
 * Mode.
 * @returns {"symlink" | "copy"}
 */
function link(sourceDir, targetDir) {
  try {
    fs.symlinkSync(sourceDir, targetDir, "junction");
    return "symlink";
  } catch {
    fs.cpSync(sourceDir, targetDir, { recursive: true });
    return "copy";
  }
}

function main() {
  const { source, target, names } = readConfig();
  const sourceRoot = path.join(repoRoot, source);
  const targetRoot = path.join(repoRoot, target);

  const missing = names.filter((n) => !fs.existsSync(path.join(sourceRoot, n, "SKILL.md")));
  if (missing.length > 0) {
    console.error(`Missing source skills under ${source}:`);
    for (const n of missing) console.error(`  ${n}`);
    process.exitCode = 1;
    return;
  }

  const present = fs.existsSync(targetRoot)
    ? fs
        .readdirSync(targetRoot)
        .filter((n) => !n.startsWith("."))
        .sort()
    : [];

  if (checkOnly) {
    const extra = present.filter((n) => !names.includes(n));
    const absent = names.filter((n) => !present.includes(n));
    if (extra.length === 0 && absent.length === 0) {
      console.log(`Project skills are in sync. ${names.length} skills.`);
      return;
    }
    for (const n of absent) console.error(`  absent: ${n}`);
    for (const n of extra) console.error(`  unexpected: ${n}`);
    console.error("Run `npm run skills:setup` to fix.");
    process.exitCode = 1;
    return;
  }

  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });

  let copies = 0;
  for (const n of names) {
    if (link(path.join(sourceRoot, n), path.join(targetRoot, n)) === "copy") copies += 1;
  }

  console.log(`Wrote ${names.length} skills to ${target}.`);
  if (copies > 0) {
    console.log(`${copies} were copied because this platform refused a symlink.`);
    console.log("Re-run this script after editing a skill under .agents/skills/.");
  }
}

main();
