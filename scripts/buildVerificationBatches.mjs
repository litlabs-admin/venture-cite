#!/usr/bin/env node
/**
 * Groups findings from the consolidated register into verification batches and
 * writes one prompt per batch.
 *
 * Batching rule: findings in the same file go in the same batch, because a
 * verifier that has already read a file can judge its other findings almost for
 * free. Batches are then filled to a target finding count.
 *
 * Only critical and high findings are batched by default. Verifying 277 findings
 * costs more than it returns when 138 of them are medium and 46 are low. Pass
 * --severity to widen it.
 *
 * Usage:
 *   node scripts/buildVerificationBatches.mjs
 *   node scripts/buildVerificationBatches.mjs --severity critical,high,medium --per-batch 12
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditDir = path.join(repoRoot, ".audit", "B1p");
const outDir = path.join(auditDir, "verify");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const severities = new Set(arg("severity", "critical,high").split(","));
const perBatch = Number(arg("per-batch", "10"));

const register = JSON.parse(fs.readFileSync(path.join(auditDir, "register.json"), "utf8"));
const selected = register.filter((f) => severities.has(f.severity));

// Group by file first so a verifier reads each file once.
const byFile = new Map();
for (const f of selected) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

const batches = [];
let current = [];
for (const [, group] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  if (current.length + group.length > perBatch && current.length > 0) {
    batches.push(current);
    current = [];
  }
  current.push(...group);
}
if (current.length > 0) batches.push(current);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

batches.forEach((batch, i) => {
  const id = `V${String(i + 1).padStart(2, "0")}`;
  const findings = batch
    .map(
      (f) =>
        `--- finding ${f.id} (from ${f.slices.join(", ")}) ---\n` +
        `Claimed severity: ${f.severity}\nClaimed location: ${f.file}${f.line ? `:${f.line}` : ""}\n\n${f.body}`,
    )
    .join("\n\n");

  fs.writeFileSync(
    path.join(outDir, `${id}.txt`),
    `Read .audit/B1p/VERIFY-BRIEF.md first and follow it exactly.\n\n` +
      `Your BATCH_ID is ${id}. Write your report to .audit/B1p/verify/${id}.md and nothing else.\n\n` +
      `Files involved: ${[...new Set(batch.map((f) => f.file))].join(", ")}\n\n` +
      `Examine each of the ${batch.length} findings below. Try to refute each one.\n\n${findings}\n`,
  );
});

console.log(
  `${selected.length} findings (${[...severities].join(", ")}) across ${byFile.size} files`,
);
console.log(`${batches.length} verification batches, target ${perBatch} findings each`);
console.log(`Prompts written to .audit/B1p/verify/`);
