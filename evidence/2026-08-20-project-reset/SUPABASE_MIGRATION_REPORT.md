# Supabase migration report

Date: 2026-08-21

## Current architecture

VentureCite uses Supabase Auth, Storage, and PostgreSQL.

The Express server uses Drizzle and a PostgreSQL pool.

Migrations 0096 through 0107 define the current restricted access and command work.

The root migration files and Supabase copies pass the migration sync check.

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

The repositories bind one actor to one restricted transaction. They do not expose the raw transaction.

### Transactional outbox

Migration 0098 creates the private outbox, worker role, state rules, leases, retries, cancellation, and idempotency keys.

Migrations 0099 and 0100 add content-cost convergence and claim indexes.

Migration 0102 adds the generic OpenAI job kickoff command.

## Local database proof

The combined local PostgreSQL run passed 50 of 50 tests.

It covered these suites:

- Request row-level security foundation
- Content request row-level security
- Transactional outbox migration and role behavior
- Content-cost database idempotency

The tests use the fixed local Supabase target and a shared advisory lock.

The cleanup code removes stale test grants without removing the required creator administration grant.

The local browser run also passed five of five product flows against local Supabase.

The final full test run passed 201 files and 1,536 tests.

TypeScript, ESLint, Prettier, migration sync, whitespace validation, and the production build passed.

## Production state

The production database has none of migrations 0096 through 0107 applied.

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
3. Create an isolated Supabase preview database.
4. Configure test-only provider values for the preview.
5. Deploy and verify the preview.
6. Run the production release preflight.
7. Run the read-only production metadata audit with the direct connection.
8. Confirm the backup and rollback plan.
9. Apply migrations 0096 through 0107 through the controlled migration command.
10. Run the role command in dry-run mode.
11. Apply role memberships through the confirmation gate.
12. Run the canary and monitor errors.
13. Add the verified privacy values and review the public page last.

Production stays read-only until every gate passes.
