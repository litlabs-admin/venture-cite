# CLAUDE.md

Claude Code reads this file every session. Keep it short. Put durable engineering
rules in [AGENTS.md](AGENTS.md) instead, which every agent reads.

Read [AGENTS.md](AGENTS.md) before you change code. It holds the change rules,
the database and jobs rules, and the verification commands. This file holds only
what is specific to running Claude Code on this repository.

## Project shape, verified 2026-08-28

Do not trust a description of this repository until you check it. The list below
was verified against code, not documentation.

- `client/` holds the React UI. `src/` holds the TanStack Start route layer.
  They are not duplicates. `vite.config.ts` aliases `@` to `client/src`, and
  `tanstackStart({ srcDirectory: "../src" })` makes `src/` the route directory.
- Production runs Nitro. `srvx` bridges the Express app in through
  `src/server/expressBridge.ts`. `server/index.ts` is development only and
  throws under `NODE_ENV=production`.
- Supabase provides authentication and hosted Postgres. No application code
  calls `supabase.from()` or `supabase.rpc()`. All table access goes through
  Drizzle over a direct Postgres pool.
- `migrations/` is the source of truth. `supabase/migrations/` is a generated
  mirror. `server/lib/migrationRunner.ts` is the real runner.
- `api/_bundle.js` is dead. Git does not track it. Do not read it or edit it.

## Standing rules

These come from repeated corrections across past sessions. A hook enforces the
first one.

- Never commit, push, merge, or reset unless the owner asks in the current turn.
- Never mention Claude or any AI tool in a commit message or pull request.
- Verify from code. Treat every Markdown file and every code comment as a hint
  to check, never as evidence.
- Do not claim work is done until you have run the real thing and read the real
  output. Compiling is not evidence.
- Do not fix only the reported case. Find the general defect.
- Prefer deleting over adding.
- Start containers only when a phase needs them. Stop them immediately after.
- Run one test suite at a time.

## Verification

`npm run check`, `npm run lint`, `npm run format:check`, and `npm test`.

Integration tests need a database. Without `TEST_DATABASE_URL` they skip
silently, so a green `npm test` does not prove the integration suite passed.
Check what actually ran.

## Skills

`npm run skills:setup` regenerates `.claude/skills/` from
`.agents/project-skills.json`. Run it after cloning. `npm run skills:check`
verifies it in CI.

`.claude/skills/` is generated and git ignores it. Edit skills under
`.agents/skills/`, then regenerate. Record any local edit to a vendored skill in
that skill's `SOURCE.md`.

The superpowers plugin supplies its own skills under a `superpowers:` prefix.
The project set deliberately excludes them so the listing holds one entry per
job.

Route work to skills this way.

| Situation                              | Skill                                          |
| -------------------------------------- | ---------------------------------------------- |
| Before claiming done                   | `principle-prove-it-works`                     |
| Judging what a change could break      | `blast-radius`                                 |
| Any writing, including commit messages | `unslop`                                       |
| Documentation and RFCs                 | `technical-writing`                            |
| Work larger than one session           | `wayfinder`                                    |
| Long or unattended work                | `show-me-your-work`                            |
| Designing a module boundary            | `codebase-design`, `architect`                 |
| Understanding a subsystem first        | `how`                                          |
| Migrations and staged rewrites         | `principle-sequence-verifiable-units`          |
| A bug report                           | `diagnosing-bugs`, `principle-fix-root-causes` |
| Anything touching Postgres             | `supabase-postgres-best-practices`             |

## Delegating to Codex

Codex models set `include_skills_usage_instructions: false`, and Codex resolves
skills only from `~/.codex/skills` and `~/.agents/skills`. This project keeps its
skills in `.agents/skills/`, so naming a skill in a prompt is not enough. A Codex
agent told to use `unslop` reads `~/.agents/skills/unslop/SKILL.md`, gets
PathNotFound, and carries on without it. Verified 2026-08-28.

Dispatch through the wrapper, which inlines the skill text and fails when the
agent produces no artifact:

```sh
node scripts/codexDispatch.mjs --model luna --effort high \
  --skills unslop,principle-prove-it-works \
  --prompt <task file> --expect <output file> --log <log file>
```

| Work                               | Model           | Effort         |
| ---------------------------------- | --------------- | -------------- |
| Read many files and criticise them | `gpt-5.6-luna`  | high           |
| Mechanical codemods and renames    | `gpt-5.6-luna`  | medium         |
| Reconcile findings across files    | Sonnet subagent | not applicable |
| Decompose modules, design RLS      | `gpt-5.6-terra` | high or xhigh  |
| Work needing self delegation       | `gpt-5.6-terra` | ultra          |

Project policy excludes `gpt-5.6-sol`. Luna does not support `ultra`.

Start at the lowest model and effort pair that produces a checkable artifact.
Escalate only the stage that failed.

Every dispatch carries the task brief with file paths and line numbers, the
command that proves the work, the skills inlined by the wrapper, and a
requirement to append one row per decision to the `show-me-your-work` ledger.

Always pass `--expect`. A Codex run that exits 0 and writes nothing looks like
success in a log and is a failure in fact.

## Current work

The active program is described in
[docs/superpowers/specs/2026-08-28-remediation-program-design.md](docs/superpowers/specs/2026-08-28-remediation-program-design.md).
Read section 2 before you accept any claim about this repository.
