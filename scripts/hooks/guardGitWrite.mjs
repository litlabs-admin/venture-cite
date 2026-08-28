#!/usr/bin/env node
/**
 * PreToolUse hook on Bash. Blocks a git command that writes history unless the
 * caller opts in explicitly.
 *
 * Why: across 16 past sessions the owner restated "do not commit or push unless
 * I ask" at least five times, and it kept happening anyway. Prose did not hold.
 * This encodes the rule as structure.
 *
 * Escape hatch: prefix the command with `VC_ALLOW_GIT_WRITE=1`. Set it only in
 * the turn where the owner asked for the write.
 */

import process from "node:process";

const BLOCKED = [
  /\bgit\s+commit\b/,
  /\bgit\s+push\b/,
  /\bgit\s+merge\b/,
  /\bgit\s+rebase\b/,
  /\bgit\s+cherry-pick\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+branch\s+-[dD]\b/,
  /\bgit\s+checkout\s+--\s/,
];

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let command = "";
  try {
    command = JSON.parse(raw)?.tool_input?.command ?? "";
  } catch {
    process.exit(0); // Malformed payload must never block real work.
  }

  if (command.includes("VC_ALLOW_GIT_WRITE=1")) process.exit(0);

  const hit = BLOCKED.find((re) => re.test(command));
  if (!hit) process.exit(0);

  process.stderr.write(
    [
      "Blocked by the project git-write guard.",
      "",
      `Command: ${command.trim().slice(0, 200)}`,
      "",
      "This repository forbids commits, pushes, merges, rebases, and hard resets",
      "unless the owner asked for one in the current turn.",
      "",
      "If the owner did ask, re-run the command with the opt-in prefix:",
      "  VC_ALLOW_GIT_WRITE=1 <your git command>",
      "",
      "If the owner did not ask, do not run it. Report what you would have done.",
    ].join("\n"),
  );
  process.exit(2);
});
