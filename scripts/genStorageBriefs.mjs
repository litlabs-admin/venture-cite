#!/usr/bin/env node
/**
 * Generates one dispatch brief per storage domain from `.audit/B5/allocation.json`.
 *
 * Why this is a file rather than an inline `node -e`: the brief text is full of
 * backticks, and passing it through a shell mangles every one of them. Four
 * inline attempts during this program produced silently corrupted output, twice
 * in ways that only surfaced when an agent acted on the damaged instruction.
 *
 * Usage: node scripts/genStorageBriefs.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditDir = path.join(repoRoot, ".audit", "B5");
const outDir = path.join(auditDir, "prompts");

const allocation = JSON.parse(fs.readFileSync(path.join(auditDir, "allocation.json"), "utf8"));

// Smallest first, so the pattern is proven before the 51-method domains.
const order = [
  "chatbot",
  "identity",
  "competitors",
  "jobs",
  "brands",
  "factAgent",
  "platform",
  "citations",
  "prompts",
  "signals",
  "content",
];

const missing = order.filter((d) => !allocation[d]);
if (missing.length > 0) {
  console.error(`allocation.json has no entry for: ${missing.join(", ")}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

order.forEach((domain, index) => {
  const n = String(index + 1).padStart(2, "0");
  const methods = [...allocation[domain]].sort();
  const id = `B5-${n}-${domain}`;

  const brief = [
    `Extract the ${domain} storage domain into \`server/storage/${domain}Storage.ts\`.`,
    "",
    `Module ${index + 1} of 11. Read \`.audit/B5/PARTITION.md\` first. It records the`,
    "design and why it is shaped this way.",
    "",
    "## The pattern",
    "",
    "`server/storage/workflowStorage.ts` already uses the target shape. Follow it:",
    "",
    `    export const ${domain}Storage = {`,
    "      async someMethod(...) { ... },",
    "    } satisfies Partial<IStorage> & ThisType<IStorage>;",
    "",
    "`DatabaseStorage` is stateless with no instance fields, so its methods move",
    "verbatim into a plain object.",
    "",
    "## What moves",
    "",
    `These ${methods.length} methods, from \`server/databaseStorage.ts\`:`,
    "",
    ...methods.map((m) => `  ${m}`),
    "",
    "Move each body VERBATIM. Do not reformat, rename, simplify, or fix anything you",
    "notice along the way. A gate compares every method body before and after with",
    "whitespace collapsed, and it fails on any edit. If you find a real defect,",
    "write it in your report and leave the code alone.",
    "",
    "## Cross-domain calls stay as `this.`",
    "",
    "Some methods call others that live in a different domain. Do NOT import the",
    "other domain module to resolve that. Object spread preserves `this` binding to",
    "the composed `storage` object, so `this.getBrandById()` resolves at runtime",
    "without an import, and `ThisType<IStorage>` gives TypeScript the same view.",
    "Importing across domains builds the dependency tangle this composition exists",
    "to avoid.",
    "",
    "Where a method used `this.x()` inside the class, it keeps using `this.x()`. You",
    "may need `this: IStorage` as a first parameter for TypeScript to accept it.",
    "",
    "## Wiring",
    "",
    "`server/storage.ts` composes the result. While `DatabaseStorage` still holds the",
    "remaining methods, spread the class instance as well so the composition stays",
    "complete:",
    "",
    `    export const storage: IStorage = { ...new DatabaseStorage(), ...${domain}Storage };`,
    "",
    "Order matters: the extracted module must win, so it comes last. TypeScript",
    "enforces completeness. An incomplete spread produces TS2741 naming the missing",
    "method.",
    "",
    "## What must not change",
    "",
    "`IStorage` keeps all 307 declarations. No consumer file changes; 60 files import",
    "this layer. No method body changes. No method is implemented twice.",
    "",
    "Delete the moved methods from `DatabaseStorage`. Leaving them in place makes the",
    "method implemented twice, which the gate rejects.",
    "",
    "## Acceptance",
    "",
    "    npx tsx scripts/storageSurface.ts --check",
    "    npm run check",
    "    npm run lint",
    "    npm run format:check",
    "    npm test -- --maxWorkers=1",
    "",
    "The first must report the surface intact, with no duplicates and no body",
    "changed. If it reports a changed body, you edited something during a move.",
    "Restore it.",
    "",
    "## Clean up after yourself, but only after yourself",
    "",
    "Delete temporary files you create. Do not delete anything you did not create.",
    "Files under `.audit/B5/prompts/` are inputs, not temporary work.",
    "",
    "## Report",
    "",
    `Write \`.audit/B5/${id}-report.md\`: how many methods moved, any that call across`,
    "a domain via `this.` and how you handled them, the gate output, and whether any",
    "consumer file changed. Note any defect you spotted and deliberately left alone.",
    "",
    "## This run is non-interactive",
    "",
    "Nobody can answer you. Decide, implement, verify, report. Do not end your turn",
    "with a question.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(outDir, `${id}.txt`), brief);
  console.log(`  ${id}  ${methods.length} methods  ${brief.length} bytes`);
});

console.log(`\nWrote ${order.length} briefs to .audit/B5/prompts/`);
