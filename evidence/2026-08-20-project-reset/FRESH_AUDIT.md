# VentureCite current audit

Date: 2026-08-22

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

## Supabase preview verification

The empty preview branch is `venturecite-reset-preview`.

The data-backed preview branch is `venturecite-reset-data-preview`.

The data-backed branch uses a production snapshot for storage checks. It is ephemeral and has no user access.

The data-backed branch contains 46 users, 45 brands, and 29 articles.

The preview application ledger contains 111 checked migration rows through `0110_request_brand_soft_delete.sql`.

The preview checks found no orphaned article, brand, or job ownership rows.

The preview checks found protected migration ledgers, enabled RLS, and the three restricted request roles.

No provider call, email, payment, or production write occurred.

The empty preview migration runner completed with strict TLS and the approved `0093_stripe_owned_trial.sql` baseline. It applied no new migration. A follow-up ledger query found 111 rows with non-null checksums through `0110_request_brand_soft_delete.sql`.

A local preview-only server returned HTTP 200 from `/health` and `/`. It used fake generation and disabled email, billing setup, and scheduling. The server was stopped after verification.

## Local verification

The latest local PostgreSQL integration run passed 37 of 37 tests.

It covered request-role isolation, content-role isolation, outbox behavior, and content-cost idempotency.

The local browser run passed five of five flows with fake generation.

The flows covered article editing, generation success, generation cancellation, distribution, and tenant isolation.

The latest full test run passed 203 files and 1,551 tests.

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

Brand creation and website import now use the actor-bound request repository with an atomic brand quota check.

Deletion ownership checks and soft-delete scheduling now use the actor-bound request repository. Deletion preview counts still use owner-side aggregate reads after the ownership check.

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

The current Management API metadata check found 94 production migration rows through `0093_stripe_owned_trial.sql`, with no checksums. Migrations `0094` through `0110` remain absent. No production migration ran.

The current login is `postgres`, with RLS bypass and nine granted roles. The request role does not exist. The direct-session audit could not connect from this workstation, so the release environment still needs `DATABASE_DIRECT_URL` and a network path to the direct endpoint.

Do not activate the request-role routes in production before the controlled migration and role gates pass.

Evidence: `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md`.

## Release gaps

The Supabase CLI is installed and authenticated for the approved project.

The release environment still lacks the runtime role, direct database URL, Stripe catalogue values, Resend sender, and secure HTTPS application URL.

The local `.env` uses `RESEND_FROM_EMAIL`. The application and preflight require `RESEND_FROM_ADDRESS`.

The empty migration preview and the separate data-backed preview are created and verified. A Vercel preview with test-provider values remains pending.

The backup and restore procedure, controlled migrations, role dry run, role application, canary, and monitoring remain pending.

The data-backed preview advisor reported leaked-password protection and RLS initialization-plan warnings.
Review these warnings before production release.

The privacy legal entity and contact values remain deferred until the final release phase.

## Release order

1. Load the approved release values securely.
2. Keep the verified empty and data-backed previews isolated from users and providers.
3. Configure and verify a preview with test-provider values.
4. Run the production read-only preflight and direct-session metadata audit.
5. Verify backup and restore.
6. Apply migrations 0096 through 0110 through the controlled release command.
7. Run the role membership dry run.
8. Apply the role memberships through the confirmation gate.
9. Run the production canary and monitor errors.
10. Add the verified privacy values and review the public page last.

Production stays read-only until every gate passes.
