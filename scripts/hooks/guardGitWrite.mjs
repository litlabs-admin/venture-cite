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

  // Tree-wide reverts. Added 2026-08-30 after a subagent ran `git stash`
  // while four others were working in the same worktree: it swept up 33
  // files, including a production migration fix and completed, verified work
  // from three separate agents, and left the tree looking merely "clean".
  // Nothing failed and nothing warned - the loss was only noticed because a
  // file that had been edited minutes earlier was silently back to its
  // committed state.
  //
  // `git stash list` and `git stash show` are read-only and stay allowed.
  /\bgit\s+stash\b(?!\s+(list|show)\b)/,
  /\bgit\s+restore\b/,
  /\bgit\s+clean\b/,
  // `git checkout <ref> -- <path>` overwrites working-tree files from another
  // commit. Recovering from the incident above needed exactly this, which is
  // why it is blocked rather than forbidden: use the opt-in, deliberately.
  /\bgit\s+checkout\s+\S+\s+--\s/,
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
