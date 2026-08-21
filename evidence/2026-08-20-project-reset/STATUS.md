# Project reset status

Date: 2026-08-22

## Scope and safety

This report uses current source, tests, command output, Git state, and read-only production metadata.

Production remains unchanged. No production migration, provider call, email, payment, preview deployment, or release occurred.

The local Supabase stack completed final verification and is stopped. Its local backup remains available for restart.

The public privacy page still has deferred legal entity and privacy contact placeholders.

## Implemented work

Migrations 0096 through 0110 define the restricted request roles, transactional outbox, provider kickoff, content commands, provider state, quota-period handling, and request-scoped brand soft delete.

Every root migration has a synchronized Supabase migration copy.

Actor-bound repositories now handle these request paths:

- User profile reads and updates
- Brand list, get, and update
- Article and revision reads and writes
- Distribution and keyword reads and writes
- Content generation enqueue, advance, cancel, and state reads

Brand creation and website import now use the actor-bound request repository with an atomic brand quota check.

Deletion ownership checks and soft-delete scheduling now use the actor-bound request repository. Deletion preview counts still use owner-side aggregate reads after the ownership check.

The request repositories do not expose a raw transaction. Each method opens one restricted transaction and closes it before return.

The content-cost command now enters the outbox inside the content completion transaction. The drain records one `api_costs` row per idempotency key.

The generic `llm_jobs` flow also uses the transactional outbox for provider kickoff.

Stripe, Resend, Buffer, and synchronous language-model routes keep their existing contracts. They do not use the outbox.

## Verified local results

The latest local PostgreSQL integration run passed 37 of 37 tests.

It covered request-role isolation, content-role isolation, outbox behavior, and content-cost idempotency.

The database-backed content-cost test called `recordSpend` twice with one key. PostgreSQL stored one `api_costs` row.

The local browser run passed five of five flows in 1 minute:

- Article create and edit
- Content generation success with the fake provider
- Content generation cancellation with the fake provider
- Distribution create, update, and reload
- Brand deletion safety

The final browser run made no live OpenAI call. Local fake mode disables live OpenAI access.

The latest full test run passed 203 files and 1,551 tests.

Nineteen files and 89 tests skipped under their configured conditions.

These final checks passed:

- TypeScript and tour-target verification
- ESLint with zero errors
- Prettier
- Supabase migration synchronization
- Git whitespace validation
- The production build with Sentry upload disabled

Development now rejects remote Supabase and provider settings before startup. Non-production email delivery is disabled unless explicitly enabled.

The combined review found four release issues. The final worktree fixes each issue:

- Migration 0107 preserves the immutable migration 0104 checksum.
- Migrations 0108 through 0110 are synchronized with their root migration files.
- Local E2E grants use the local administrator and revoke only their own grants.
- The local Playwright project forces the fixed loopback Supabase API and explicit local keys.
- Fake-provider mode blocks the article-improvement OpenAI call.

## Production release state

The production metadata audit used strict Transport Layer Security (TLS) and one read-only transaction.

The audit ended with `ROLLBACK`. It did not read application rows.

The read-only production audit recorded migrations 0096 through 0107 as unapplied. This branch has not run migrations 0108 through 0110 against production. Recheck the production ledger before release.

The request-role membership command and release preflight have not run against production.

The current Vercel preview shares major production variables. Do not deploy it until it uses isolated Supabase and test-provider values.

## Provider scope

Generic OpenAI kickoff and content-cost recording use the transactional outbox.

Stripe, Resend, Buffer, and synchronous language-model routes remain direct by design.

Provider-wide outbox conversion is not a release gate for this reset wave.

## Remaining gates

1. Load the approved release values securely.
2. Configure the verified preview branches with test-provider values.
3. Deploy and verify a preview without production access.
4. Run the read-only production preflight and metadata audit.
5. Confirm the production backup and restore plan.
6. Apply migrations through the controlled release command.
7. Configure the restricted role memberships through the confirmed command.
8. Run the production canary and monitor errors.
9. Add the verified privacy values and review the rendered page last.

Production stays read-only until every pre-release gate passes.
