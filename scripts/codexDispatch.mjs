#!/usr/bin/env node
/**
 * Dispatches one task to a Codex model with project skills inlined.
 *
 * Why this exists: Codex resolves skills from `~/.codex/skills` and
 * `~/.agents/skills`, both user level. This project keeps its skills in
 * `.agents/skills/`, so a Codex agent told to "use the unslop skill" tries to
 * read `~/.agents/skills/unslop/SKILL.md`, gets PathNotFound, and continues
 * without it. Verified on 2026-08-28. Naming a skill in a prompt is not enough.
 *
 * This script reads the skill text from the project and puts it in the prompt,
 * so delivery does not depend on where Codex looks.
 *
 * It also refuses to report success when the expected artifact was not written.
 * A dispatch that finishes cleanly but produces nothing is a failure.
 *
 * Usage:
 *   node scripts/codexDispatch.mjs \
 *     --model luna --effort high \
 *     --skills unslop,principle-prove-it-works \
 *     --prompt .audit/B1p/prompts/S01.txt \
 *     --expect .audit/B1p/S01.md \
 *     --log .audit/B1p/logs/S01.log
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(repoRoot, ".agents", "skills");

const MODELS = { luna: "gpt-5.6-luna", terra: "gpt-5.6-terra" };
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--")) throw new Error(`Expected a flag, got: ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const model = MODELS[args.model ?? "luna"];
const effort = args.effort ?? "high";

if (!model) throw new Error(`Unknown model "${args.model}". Use luna or terra.`);
if (!EFFORTS.has(effort)) throw new Error(`Unknown effort "${effort}".`);
if (model === MODELS.luna && effort === "ultra") {
  throw new Error("Luna does not support ultra. Use terra.");
}
if (!args.prompt) throw new Error("--prompt is required.");

const skillNames = (args.skills ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const skillSections = skillNames.map((name) => {
  const file = path.join(skillsRoot, name, "SKILL.md");
  if (!fs.existsSync(file)) {
    throw new Error(`Skill "${name}" not found at .agents/skills/${name}/SKILL.md`);
  }
  return `<skill name="${name}">\n${fs.readFileSync(file, "utf8").trim()}\n</skill>`;
});

const task = fs.readFileSync(args.prompt, "utf8");
const preamble = skillSections.length
  ? [
      "The following skills apply to this task. Follow them. They are included",
      "here in full because your skill directory does not contain them.",
      "",
      skillSections.join("\n\n"),
      "",
      "---",
      "",
    ].join("\n")
  : "";

const composed = `${preamble}${task}`;

const child = spawn(
  "codex",
  ["exec", "-m", model, "-c", `model_reasoning_effort=${effort}`, "-"],
  // shell:true is required on Windows, where `codex` is a .cmd shim that
  // spawn() cannot resolve directly.
  { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"], shell: true },
);

child.on("error", (err) => {
  console.error(`FAIL: could not start codex: ${err.message}`);
  process.exit(1);
});

const logStream = args.log ? fs.createWriteStream(args.log) : null;
child.stdout.on("data", (d) => logStream?.write(d));
child.stderr.on("data", (d) => logStream?.write(d));
child.stdin.write(composed);
child.stdin.end();

child.on("close", (code) => {
  logStream?.end();
  const label = `${args.model ?? "luna"}/${effort} ${path.basename(args.prompt)}`;

  if (code !== 0) {
    console.error(`FAIL ${label}: codex exited ${code}`);
    process.exit(1);
  }
  if (args.expect && !fs.existsSync(args.expect)) {
    console.error(`FAIL ${label}: exited 0 but did not write ${args.expect}`);
    process.exit(1);
  }
  const size = args.expect ? fs.statSync(args.expect).size : 0;
  if (args.expect && size === 0) {
    console.error(`FAIL ${label}: wrote an empty ${args.expect}`);
    process.exit(1);
  }
  console.log(`OK   ${label}${args.expect ? ` -> ${args.expect} (${size} bytes)` : ""}`);
});
