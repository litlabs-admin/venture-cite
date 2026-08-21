# VentureCite current audit

Date: 2026-08-21

## Evidence rules

This report uses current source, current test output, Git state, and the read-only production audit.

Older reports do not override current source or current command output.

## Safety result

The production audit used one read-only transaction and ended with `ROLLBACK`.

No production migration, provider call, email, payment, deployment, push, or merge occurred.

The local Supabase stack is stopped.

Development now rejects remote Supabase and provider settings before startup.

Non-production email delivery is disabled unless explicitly enabled.

Evidence: `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md`, `server/lib/environmentSafety.ts`, `server/env.ts`, `server/emailService.ts`, and `server/lib/welcomeEmail.ts`.

## Local verification

The latest local PostgreSQL integration run passed 37 of 37 tests.

It covered request-role isolation, content-role isolation, outbox behavior, and content-cost idempotency.

The local browser run passed five of five flows with fake generation.

The flows covered article editing, generation success, generation cancellation, distribution, and tenant isolation.

The latest full test run passed 202 files and 1,542 tests.

These checks passed:

- TypeScript and tour-target verification
- ESLint
- Prettier
- Supabase migration synchronization
- Git whitespace validation
- Production build

Evidence: `.audit/project-reset-decisions.tsv`, `tests/integration/`, `tests/e2e/`, and the current Git history.

## Current application state

Actor-bound repositories handle user profiles, brands, articles, revisions, distributions, keywords, and content jobs.

Brand creation, website import, deletion preview, and deletion still use the legacy owner path.

The repositories open restricted transactions and do not return raw transactions to request routes.

Generic OpenAI kickoff and content-cost recording use the transactional outbox.

Stripe, Resend, Buffer, and synchronous model routes remain direct because their current responses need provider results.

Article-generation provider kickoff remains direct until an outbox design preserves its lease, deadline, cancellation, and response-link rules.

Evidence: `evidence/2026-08-20-project-reset/PROVIDER_OUTBOX_AUDIT.md`, `server/data/`, `server/routes/`, and `server/outbox/`.

## Production findings

The read-only production audit found 62 public relations.

All 62 relations have RLS enabled.

The request role does not exist in production.

The runtime login has broader privileges than the target least-privileged role.

The read-only production audit recorded migrations 0096 through 0107 as unapplied. This branch has not run migrations 0108 or 0109 against production. Recheck the production ledger before release.

Do not activate the request-role routes in production before the controlled migration and role gates pass.

Evidence: `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md`.

## Release gaps

The Supabase CLI is installed but has no access token.

The release environment still lacks the runtime role, direct database URL, Stripe catalogue values, Resend sender, and secure HTTPS application URL.

An isolated preview database and test-provider configuration are still required.

The backup and restore procedure, controlled migrations, role dry run, role application, canary, and monitoring remain pending.

The privacy legal entity and contact values remain deferred until the final release phase.

## Release order

1. Authenticate the Supabase CLI.
2. Load the approved release values securely.
3. Create and verify the isolated preview.
4. Run the production read-only preflight and metadata audit.
5. Verify backup and restore.
6. Apply migrations 0096 through 0109 through the controlled release command.
7. Run the role membership dry run.
8. Apply the role memberships through the confirmation gate.
9. Run the production canary and monitor errors.
10. Add the verified privacy values and review the public page last.

Production stays read-only until every gate passes.
