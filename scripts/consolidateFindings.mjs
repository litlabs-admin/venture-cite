#!/usr/bin/env node
/**
 * Parses the B1p audit reports into one normalised register and groups likely
 * duplicates.
 *
 * Why this exists: 29 agents audited overlapping slices, and several files
 * appear as context in one slice and as an audit target in another. The same
 * defect therefore gets reported more than once, in different words. Matching
 * those by hand is slow and unreliable, and it is exact work, so a script does
 * it rather than a model.
 *
 * Duplicate rule: two findings are candidates for the same defect when they name
 * the same file and their line numbers are within 5 of each other. That is a
 * candidate, not a verdict. A human or a verification agent still decides.
 *
 * Usage:
 *   node scripts/consolidateFindings.mjs
 *   node scripts/consolidateFindings.mjs --severity critical,high
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditDir = path.join(repoRoot, ".audit", "B1p");

const severityArg = process.argv.indexOf("--severity");
const wanted =
  severityArg === -1
    ? null
    : new Set(process.argv[severityArg + 1].split(",").map((s) => s.trim()));

const RANK = { critical: 0, high: 1, medium: 2, low: 3 };

/** @returns {Array<{id:string,slice:string,severity:string,category:string,file:string,line:number|null,body:string}>} */
function parseReports() {
  const findings = [];
  const reports = fs
    .readdirSync(auditDir)
    .filter((n) => /^(S\d\d|INV\d\d)/.test(n) && n.endsWith(".md"));

  for (const name of reports) {
    const slice = name.replace(/\.md$/, "");
    const text = fs.readFileSync(path.join(auditDir, name), "utf8");
    const blocks = text.split(/^### /m).slice(1);

    for (const block of blocks) {
      const header = block.split("\n")[0];
      const parts = header.split("|").map((s) => s.trim());
      if (parts.length < 2) continue;

      const id = parts[0];
      const severity = (parts[1] ?? "").toLowerCase();
      if (!(severity in RANK)) continue;
      if (wanted && !wanted.has(severity)) continue;

      // Slice reports use `File:`. Invariant reports use `Written at:` or
      // `Defined at:`, and their `Key:`/`Item:` line names the thing, not a path.
      // Require a file extension before the optional line number, or a reference
      // like `server/auth.ts:231-256` is swallowed whole as the path and
      // duplicate matching silently fails. A range keeps its first line.
      const fileLine = block.match(
        /^(?:File|Written at|Defined at|Item|Key):\s*`?([^\s`,:]+\.[A-Za-z]+)(?::(\d+))?/m,
      );
      findings.push({
        id,
        slice,
        severity,
        category: parts[2] ?? "unspecified",
        file: fileLine?.[1] ?? "UNKNOWN",
        line: fileLine?.[2] ? Number(fileLine[2]) : null,
        body: block.trim(),
      });
    }
  }
  return findings;
}

function groupDuplicates(findings) {
  const groups = [];
  const used = new Set();

  for (let i = 0; i < findings.length; i += 1) {
    if (used.has(i)) continue;
    const group = [findings[i]];
    used.add(i);

    for (let j = i + 1; j < findings.length; j += 1) {
      if (used.has(j)) continue;
      const a = findings[i];
      const b = findings[j];
      if (a.file === "UNKNOWN" || a.file !== b.file) continue;
      const close = a.line !== null && b.line !== null && Math.abs(a.line - b.line) <= 5;
      if (close || (a.line === null && b.line === null)) {
        group.push(b);
        used.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

const findings = parseReports();
const groups = groupDuplicates(findings);
groups.sort((a, b) => RANK[a[0].severity] - RANK[b[0].severity] || b.length - a.length);

const bySeverity = {};
for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;

const lines = [];
lines.push("# Consolidated findings register");
lines.push("");
lines.push(`Reports parsed: ${new Set(findings.map((f) => f.slice)).size}`);
lines.push(`Findings: ${findings.length}`);
lines.push(`Distinct after duplicate grouping: ${groups.length}`);
lines.push(
  `By severity: ${Object.entries(bySeverity)
    .sort((a, b) => RANK[a[0]] - RANK[b[0]])
    .map(([s, n]) => `${s} ${n}`)
    .join(", ")}`,
);
lines.push("");
lines.push("Nothing here is verified. Each entry is a claim by one agent.");
lines.push("");
lines.push("| # | Severity | File | Line | Category | Reported by | Copies |");
lines.push("| --- | --- | --- | --- | --- | --- | --- |");
groups.forEach((g, i) => {
  const f = g[0];
  lines.push(
    `| ${i + 1} | ${f.severity} | \`${f.file}\` | ${f.line ?? ""} | ${f.category} | ${[
      ...new Set(g.map((x) => x.slice)),
    ].join(", ")} | ${g.length} |`,
  );
});

const outPath = path.join(auditDir, "REGISTER.md");
fs.writeFileSync(outPath, `${lines.join("\n")}\n`);

fs.writeFileSync(
  path.join(auditDir, "register.json"),
  `${JSON.stringify(
    groups.map((g, i) => ({
      n: i + 1,
      ...g[0],
      copies: g.length,
      slices: [...new Set(g.map((x) => x.slice))],
    })),
    null,
    1,
  )}\n`,
);

console.log(
  `${findings.length} findings from ${new Set(findings.map((f) => f.slice)).size} reports`,
);
console.log(
  `${groups.length} distinct after grouping (${findings.length - groups.length} likely duplicates)`,
);
console.log(
  Object.entries(bySeverity)
    .sort((a, b) => RANK[a[0]] - RANK[b[0]])
    .map(([s, n]) => `  ${s}: ${n}`)
    .join("\n"),
);
console.log(`\nWrote .audit/B1p/REGISTER.md and register.json`);
