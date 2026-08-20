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

All 20 skills have automatic invocation metadata and pinned source records.

The official skill validator passes for all 20 skills under Python 3.12.

The stale Markdown scan found possible user data in 15 files.

The archive pass replaced those details with synthetic placeholders.

Two local commits preserve all 101 stale Markdown files.

The maintained tree now removes 109 redundant Markdown files.

Six current project guides replace the old setup and architecture claims.

The public privacy policy still needs the legal entity and privacy contact.

The fresh static audit confirmed 14 defects or production risks.

The type check passes.

The lint command passes with 813 warnings.

The format check passes across the repository.

The database test setup now rejects the normal application database.

A local Supabase stack uses separate ports 55321 through 55329.

The stack is stopped after tests and keeps its restartable volumes.

The separate Quinhex Supabase stack is also stopped and keeps its restartable volumes.

The Supabase CLI is a pinned development dependency.

The complete baseline and migrations 0000 through 0095 pass `supabase db reset`.

The build and application startup do not apply migrations.

The controlled production release command requires an explicit confirmation value.

The migration runner verifies SHA-256 checksums for recorded migrations.

The database integration run passed 34 tests against local Supabase.

The focused safety run passed 102 tests.

The local PostgreSQL run passed six tests.

The full local test run passed 1,449 tests and skipped 16 optional tests.

No test loaded the normal application database URL.

The dependency audit has no high or low findings.

Four moderate Drizzle Kit loader findings remain without a supported upgrade.

The final Sol reviews confirmed that ten release repair gaps are closed.

The review found no direct regression from those fixes.

The live landing, pricing, login, and registration pages render without browser errors.

The live health route remains unverified.

The strict live database metadata check reached certificate verification and failed closed.

The Supabase project CA must come from the project dashboard before the metadata query can run.

No application row was queried during that failed check.

The user deferred the Supabase CA and public privacy values until release preparation.

Migration 0096 adds a local request role and users-and-brands RLS policies.

No live route uses this role.

Ten local integration tests prove tenant isolation and pool cleanup.

The local RLS design and proof are in `SUPABASE_RLS_FOUNDATION.md`.

The tour persistence test now waits for rendered controls instead of a fixed delay.

The tour test passes with an intentional 50 ms frame delay.

The VentureCite local Supabase stack is stopped and keeps its restartable volumes.

## Next checks

1. Add named request repositories for users and brands.
2. Review the live Supabase role and policy state before route activation.
3. Configure the production database TLS settings and exact Stripe catalogue IDs.
4. Add the approved legal entity and privacy contact before public release.
5. Reduce the remaining lint warning debt.
