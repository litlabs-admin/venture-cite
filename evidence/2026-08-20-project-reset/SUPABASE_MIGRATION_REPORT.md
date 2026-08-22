# Supabase migration report

Date: 2026-08-22

## Current architecture

VentureCite uses Supabase Auth, Storage, and PostgreSQL.

The Express server uses Drizzle and a PostgreSQL pool.

Migrations 0096 through 0111 define the current restricted access, command, provider-state, quota-period, brand soft-delete, and auth-trigger access work.

The root migration files and Supabase copies pass the migration sync check.

## Preview database verification

The empty preview branch supports schema migration tests from the production baseline.

The data-backed preview branch uses a production snapshot for storage checks only.

The data-backed branch contains 46 users, 45 brands, and 29 articles.

Both preview paths contain 112 application migration rows with non-null checksums through `0111_revoke_handle_new_user_execute_after_function_replace.sql`.

The data-backed ownership checks found no orphaned article, brand, or job rows.

The data-backed preview matches production aggregate counts for users, brands, and articles: 46, 45, and 29. This validates the copied storage snapshot for the checked tables. It does not replace a formal backup and restore test.

The preview checks found enabled RLS, protected migration ledgers, and the three restricted request roles.

No production write occurred.

## Preview migration and server check

The empty preview migration runner completed on 2026-08-22 through the branch session pooler with strict TLS. It used `0093_stripe_owned_trial.sql` as the approved preview baseline and applied no new migration.

A follow-up query found 112 application migration rows with non-null checksums through `0111_revoke_handle_new_user_execute_after_function_replace.sql`.

Migration 0111 revokes Data API execution for the security-definer `public.handle_new_user()` trigger function after the function replacement in migration 0093. The empty preview runner applied it. The data-backed preview received the same idempotent SQL through the authenticated Management API because its copied pooler password was stale.

A local preview-only server connected to the empty branch and returned HTTP 200 from `/health` and `/`. The check used fake generation and disabled email, billing setup, and scheduling. The server was stopped after verification.

## Migration groups

### Request roles and row-level security

Migration 0096 restricts user and brand access.

Migration 0097 restricts content reads.

Migration 0101 adds the request-safe profile timestamp.

Migration 0103 adds request-safe content response columns.

Migration 0104 adds article and revision commands.

Migration 0105 adds distribution and keyword commands.

Migration 0106 adds generation enqueue, advance, and cancellation commands.

Migration 0107 adds request-safe article response columns without changing migration 0104.

Migration 0108 adds request-safe distribution provider state.

Migration 0109 records the quota period used by each content-generation reservation.

Migration 0110 grants the request role the two columns required to schedule an owned brand soft delete.

Migration 0111 revokes public, anon, and authenticated execution on the auth trigger function.

The repositories bind one actor to one restricted transaction. They do not expose the raw transaction.

### Transactional outbox

Migration 0098 creates the private outbox, worker role, state rules, leases, retries, cancellation, and idempotency keys.

Migrations 0099 and 0100 add content-cost convergence and claim indexes.

Migration 0102 adds the generic OpenAI job kickoff command.

## Local database proof

The latest local PostgreSQL run passed 37 of 37 tests.

It covered these suites:

- Request row-level security foundation
- Content request row-level security
- Transactional outbox migration and role behavior
- Content-cost database idempotency

The tests use the fixed local Supabase target and a shared advisory lock.

The cleanup code removes stale test grants without removing the required creator administration grant.

The local browser run also passed five of five product flows against local Supabase.

The latest full test run passed 204 files and 1,561 active tests.

TypeScript, ESLint, changed-file Prettier, migration sync, whitespace validation, and the production build passed.

The full repository Prettier check still reports 216 baseline files.

## Production state

The current Management API metadata check found 94 production migration rows through `0093_stripe_owned_trial.sql`, with no checksums. Migrations `0094` through `0111` remain absent. No production migration ran.

The direct-session audit could not connect from this workstation. The release environment still needs `DATABASE_DIRECT_URL` and a network path to the direct endpoint.

The previous production metadata audit used strict TLS and one read-only transaction.

It ended with `ROLLBACK` and returned catalog facts only.

No production database write occurred.

## Controlled release tools

The release preflight checks the direct connection, certificate authority certificate, application origin, provider configuration, scheduler mode, and runtime role name.

The migration command requires the production confirmation value and a passing preflight.

The role command verifies PostgreSQL 17, the runtime and direct database identity, role attributes, and all restricted-role memberships.

The role command grants only `SET` membership to the application runtime role.

These commands have not run against production.

## Safe release order

1. Complete the full local gate run and production build.
2. Commit the verified wave.
3. Use the verified empty and data-backed Supabase preview branches.
4. Configure test-only provider values for a preview deployment.
5. Deploy and verify the preview without production access.
6. Run the production release preflight.
7. Run the read-only production metadata audit with the direct connection.
8. Confirm the backup and rollback plan.
9. Apply migrations 0094 through 0111 through the controlled migration command.
10. Run the role command in dry-run mode.
11. Apply role memberships through the confirmation gate.
12. Run the canary and monitor errors.
13. Add the verified privacy values and review the public page last.

Production stays read-only until every gate passes.
