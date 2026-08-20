# Project reset status

## Scope

This work starts from executable code, tests, Git history, and read-only live evidence.

Existing Markdown files and code comments are not factual evidence until a check confirms them.

## Safety rules

- Protect real user data.
- Do not send test email.
- Do not print or commit secret values.
- Use isolated test accounts and tagged test data.
- Require approval before a deployment or a production write.

## Model limits

- Use Luna Low for file inventories.
- Use Terra Low or Medium for setup, code, tests, and documentation.
- Use Sol Medium for auth, billing, security, and database migration reviews.
- Do not use High effort without a new notice.

## Current phase

The repair phase is active on `codex/project-reset-setup`.

The repository contains 20 project skills, including `unslop`.

Two subagents adapted the imported skill instructions for Codex.

No live system change has occurred.

The Buffer MCP configuration now reads `BUFFER_MCP_TOKEN` from the Windows user environment.

The repository does not contain the Buffer token.

Five agent profiles now define Luna Low, Terra Low, Terra Medium, Sol Medium, and Spark Low work.

All 20 skills now have automatic invocation metadata and pinned source records.

The skill lock remains unchanged because its hash method is not available.

The stale Markdown scan found possible user data in 15 files.

The archive pass replaced those details with synthetic placeholders.

Two local commits preserve all 101 stale Markdown files.

The maintained tree now removes 109 redundant Markdown files.

Six current project guides replace the old setup and architecture claims.

The public privacy policy still needs the legal entity and privacy contact.

The fresh static audit confirmed 14 defects or production risks.

The type check passes.

The lint command passes with 813 warnings.

The format check fails across many files.

The database test setup now rejects the normal application database.

A local Supabase stack runs on separate ports 55321 through 55329.

The Supabase CLI is a pinned development dependency.

Migrations 0094 and 0095 passed real PostgreSQL tests.

Four repair commits now preserve the reviewed code and test changes locally.

The focused safety run passed 102 tests.

The local PostgreSQL run passed six tests.

The full test run passed 1,390 tests and skipped 37 database-dependent tests.

No test loaded the normal application database URL.

The dependency audit has no high or low findings.

Four moderate Drizzle Kit loader findings remain without a supported upgrade.

The final Sol review confirmed that its seven repair gaps are closed.

The review found no direct regression from those fixes.

The live landing, pricing, login, and registration pages render without browser errors.

The live health route remains unverified.

## Next checks

1. Record the unsupported Drizzle Kit advisory until its upstream fix exists.
2. Build a complete local database baseline.
3. Review the live Supabase role and policy state without user data.
4. Replace boot-time migrations with a controlled release step.
5. Add the approved legal entity and privacy contact to the public policy.
