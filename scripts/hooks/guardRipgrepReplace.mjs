#!/usr/bin/env node
/**
 * PreToolUse hook on Bash. Blocks the `rg -r<flags>` footgun.
 *
 * Why: `rg`'s `-r` is `--replace`, and it consumes the NEXT characters as the
 * replacement text. So `rg -rn 'pattern' path` does not mean "recursive, with
 * line numbers" - ripgrep is already recursive, and `-rn` parses as
 * `--replace n`, rewriting every match to the literal string "n".
 *
 * It fails silently: the command exits 0 and prints plausible-looking output
 * with every matched span replaced. During the remediation program this
 * produced a caller list where every function name read "n", twice, in
 * different sessions. Prose did not hold; this encodes it.
 *
 * The check is deliberately narrow. A real replacement is a word or a capture
 * reference, so only a 1-2 character value made entirely of common ripgrep
 * short-flag letters is treated as the mistake.
 *
 * Escape hatch: prefix with `VC_ALLOW_RG_REPLACE=1` when you genuinely want
 * `--replace` with a short value.
 */

import process from "node:process";

// Short flags people reach for and accidentally bundle after -r.
const FLAG_LETTERS = /^[nilcvwoxsuprazFLSU]{1,2}$/;

/** Every `-r` replacement value in the command, bundled or spaced. */
function replacementValues(command) {
  const found = [];
  // Only look at segments that actually invoke rg, so an unrelated `-r`
  // (cp -r, chmod -R) never trips this.
  const segments = command.split(/(?:\|\||&&|\||;|\n)/);
  for (const segment of segments) {
    if (!/(^|\s)rg(\.exe)?\s/.test(` ${segment.trim()} `)) continue;
    // Bundled: -rn / -rl. Not --replace, and not a long flag.
    for (const m of segment.matchAll(/(?<![-\w])-r([A-Za-z]{1,2})(?=\s|$)/g)) {
      found.push(m[1]);
    }
    // Spaced: -r n
    for (const m of segment.matchAll(/(?<![-\w])-r\s+([A-Za-z]{1,2})(?=\s|$)/g)) {
      found.push(m[1]);
    }
  }
  return found;
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let command = "";
  try {
    command = JSON.parse(raw)?.tool_input?.command ?? "";
  } catch {
    process.exit(0); // Malformed payload must never block real work.
  }

  if (command.includes("VC_ALLOW_RG_REPLACE=1")) process.exit(0);

  const suspect = replacementValues(command).find((v) => FLAG_LETTERS.test(v));
  if (!suspect) process.exit(0);

  process.stderr.write(
    [
      "Blocked by the ripgrep --replace guard.",
      "",
      `Command: ${command.trim().slice(0, 200)}`,
      "",
      `\`-r${suspect}\` parses as \`--replace ${suspect}\`, not as bundled flags.`,
      `Every match would be rewritten to the literal string "${suspect}" and the`,
      "command would still exit 0, so the damage is invisible in the output.",
      "",
      "ripgrep searches recursively by default. You almost certainly want:",
      `  rg -${suspect} '<pattern>' <path>`,
      "",
      "If you really do want a replacement, re-run with the opt-in prefix:",
      "  VC_ALLOW_RG_REPLACE=1 <your rg command>",
    ].join("\n"),
  );
  process.exit(2);
});
