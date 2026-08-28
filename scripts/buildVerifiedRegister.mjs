#!/usr/bin/env node
/**
 * Joins verification verdicts back onto the findings register and writes the
 * final ranked list.
 *
 * Severity comes from the verifier's corrected severity when it gave one. The
 * original severity was assigned by an agent looking for defects, and the
 * verifier read the surrounding code and the call sites before disagreeing. On
 * the first batches the verifier downgraded roughly a third of what it confirmed.
 *
 * Findings that were refuted are kept in a separate section rather than deleted.
 * A refutation is a claim too, and the reasoning is worth keeping so nobody
 * re-files the same finding next quarter.
 *
 * Usage: node scripts/buildVerifiedRegister.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditDir = path.join(repoRoot, ".audit", "B1p");
const verifyDir = path.join(auditDir, "verify");

const RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const register = JSON.parse(fs.readFileSync(path.join(auditDir, "register.json"), "utf8"));

/** @type {Map<string, {verdict:string, severity:string|null, reasoning:string, path:string, batch:string}>} */
const verdicts = new Map();

for (const name of fs.readdirSync(verifyDir).filter((n) => /^V\d\d\.md$/.test(n))) {
  const batch = name.replace(/\.md$/, "");
  const text = fs.readFileSync(path.join(verifyDir, name), "utf8");
  for (const block of text.split(/^## /m).slice(1)) {
    const header = block.split("\n")[0];
    const m = header.match(/^(\S+)\s*\|\s*(CONFIRMED|REFUTED|UNCERTAIN)/);
    if (!m) continue;
    const corrected = block.match(/^Corrected severity[^:]*:\s*(critical|high|medium|low)/im);
    verdicts.set(m[1], {
      verdict: m[2],
      severity: corrected?.[1]?.toLowerCase() ?? null,
      reasoning: (block.match(/^Verdict reasoning:\s*(.+)$/m)?.[1] ?? "").trim(),
      path: (block.match(/^Reachable path[^:]*:\s*(.+)$/m)?.[1] ?? "").trim(),
      batch,
    });
  }
}

const rows = register.map((f) => {
  const v = verdicts.get(f.id);
  return {
    ...f,
    verdict: v?.verdict ?? "UNVERIFIED",
    finalSeverity: v?.severity ?? f.severity,
    reasoning: v?.reasoning ?? "",
    reachablePath: v?.path ?? "",
    batch: v?.batch ?? "",
  };
});

const confirmed = rows
  .filter((r) => r.verdict === "CONFIRMED")
  .sort((a, b) => RANK[a.finalSeverity] - RANK[b.finalSeverity] || b.copies - a.copies);
const refuted = rows.filter((r) => r.verdict === "REFUTED");
const uncertain = rows.filter((r) => r.verdict === "UNCERTAIN");
const unverified = rows
  .filter((r) => r.verdict === "UNVERIFIED")
  .sort((a, b) => RANK[a.finalSeverity] - RANK[b.finalSeverity]);

const downgraded = confirmed.filter((r) => RANK[r.finalSeverity] > RANK[r.severity]).length;
const upgraded = confirmed.filter((r) => RANK[r.finalSeverity] < RANK[r.severity]).length;

const tally = (list) => {
  const t = {};
  for (const r of list) t[r.finalSeverity] = (t[r.finalSeverity] ?? 0) + 1;
  return Object.entries(t)
    .sort((a, b) => RANK[a[0]] - RANK[b[0]])
    .map(([s, n]) => `${s} ${n}`)
    .join(", ");
};

const out = [];
out.push("# Verified findings register");
out.push("");
out.push(`Findings raised: ${rows.length}`);
out.push(
  `Sent to verification (critical and high): ${confirmed.length + refuted.length + uncertain.length}`,
);
out.push(
  `Confirmed: ${confirmed.length}   Refuted: ${refuted.length}   Uncertain: ${uncertain.length}`,
);
out.push(`Not verified (medium and low, kept as unverified claims): ${unverified.length}`);
out.push("");
out.push(`Confirmed by severity after correction: ${tally(confirmed)}`);
out.push(`Severity changed by the verifier: ${downgraded} down, ${upgraded} up`);
out.push("");
out.push("## Confirmed");
out.push("");
out.push("Each row survived an agent whose task was to refute it.");
out.push("");
out.push("| # | Severity | File | Line | Category | Agents | Reachable path |");
out.push("| --- | --- | --- | --- | --- | --- | --- |");
confirmed.forEach((r, i) => {
  out.push(
    `| ${i + 1} | ${r.finalSeverity} | \`${r.file}\` | ${r.line ?? ""} | ${r.category} | ${r.copies} | ${r.reachablePath.slice(0, 90) || "-"} |`,
  );
});
out.push("");
out.push("## Refuted");
out.push("");
out.push("Kept so the same claim is not re-filed later.");
out.push("");
out.push("| File | Line | Original severity | Why it does not hold |");
out.push("| --- | --- | --- | --- |");
refuted.forEach((r) => {
  out.push(
    `| \`${r.file}\` | ${r.line ?? ""} | ${r.severity} | ${r.reasoning.slice(0, 110) || "-"} |`,
  );
});
if (uncertain.length > 0) {
  out.push("");
  out.push("## Uncertain");
  out.push("");
  uncertain.forEach((r) => out.push(`- \`${r.file}:${r.line ?? ""}\` ${r.reasoning}`));
}
out.push("");
out.push("## Unverified");
out.push("");
out.push(`${unverified.length} medium and low findings were not sent to verification.`);
out.push("They are claims by one agent and nothing more. See REGISTER.md for the full list.");

fs.writeFileSync(path.join(auditDir, "VERIFIED.md"), `${out.join("\n")}\n`);
fs.writeFileSync(path.join(auditDir, "verified.json"), `${JSON.stringify(rows, null, 1)}\n`);

console.log(
  `confirmed ${confirmed.length}, refuted ${refuted.length}, uncertain ${uncertain.length}, unverified ${unverified.length}`,
);
console.log(`confirmed by severity: ${tally(confirmed)}`);
console.log(
  `verifier changed severity on ${downgraded + upgraded} findings (${downgraded} down, ${upgraded} up)`,
);
console.log("Wrote .audit/B1p/VERIFIED.md and verified.json");
