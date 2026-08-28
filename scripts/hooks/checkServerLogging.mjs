#!/usr/bin/env node
/**
 * PostToolUse hook on Edit and Write. Flags a `console.log` added under
 * `server/`.
 *
 * Why: AGENTS.md requires `logger` for server logs. An audit on 2026-08-28 found
 * the rule holds everywhere except two known files, and one of those,
 * `server/lib/aiLogger.ts`, prints unredacted AI payloads to stdout. New
 * violations should surface at the moment they are written, not months later.
 *
 * The two known exceptions are allowed so this hook does not cry wolf. Remove
 * `aiLogger.ts` from the list once phase B3 redacts it.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ALLOWED = new Set([
  "server/log.ts", // Vite-template boot and access logging.
  "server/lib/aiLogger.ts", // Deliberate AI debug printer. B3 will redact it.
]);

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let filePath = "";
  try {
    filePath = JSON.parse(raw)?.tool_input?.file_path ?? "";
  } catch {
    process.exit(0);
  }
  if (!filePath) process.exit(0);

  const rel = path.relative(process.cwd(), filePath).split(path.sep).join("/");
  if (!rel.startsWith("server/")) process.exit(0);
  if (ALLOWED.has(rel)) process.exit(0);
  if (!/\.(ts|tsx|mts|js|mjs)$/.test(rel)) process.exit(0);

  let source = "";
  try {
    source = fs.readFileSync(filePath, "utf8");
  } catch {
    process.exit(0);
  }

  const hits = source
    .split("\n")
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => /\bconsole\.(log|debug|info)\s*\(/.test(line) && !line.startsWith("//"));

  if (hits.length === 0) process.exit(0);

  process.stderr.write(
    [
      `${rel} uses console logging. AGENTS.md requires \`logger\` for server logs.`,
      ...hits.slice(0, 5).map(({ n, line }) => `  ${rel}:${n}  ${line.slice(0, 100)}`),
      "",
      "Import the Pino logger from server/lib/logger.ts. It redacts sensitive keys.",
      "console output does not.",
    ].join("\n"),
  );
  process.exit(2);
});
