# Project reset status

Date: 2026-08-22

## Scope and safety

This report uses current source, test output, Git state, and verified production checks.

The production backup completed before the migration release.

The isolated restore proved that migrations 0094 through 0111 preserve current application rows.

The controlled production release completed without data loss.

No provider call, email, payment, Buffer post, push notification, or deployment occurred.

The local Supabase stack and its Docker containers are stopped.

The privacy page still has deferred legal entity and contact placeholders.

## Implemented work

Migrations 0094 through 0111 now run in production.

The production application ledger has 112 checked rows.

Actor-bound repositories handle user profiles, brands, articles, revisions, distributions, keywords, and content jobs.

Brand creation and website import use an atomic brand quota check.

Deletion checks enforce ownership before soft-delete scheduling.

Restricted transactions do not cross request boundaries.

Generic OpenAI kickoff and content-cost recording use the transactional outbox.

Stripe, Resend, Buffer, and synchronous model routes keep their existing direct contracts.

## Verified local results

The local PostgreSQL integration run passed 37 of 37 tests.

The local browser run passed five of five safe flows with fake generation.

The constrained full test run passed 203 files and 1,556 tests.

The checks passed for TypeScript, lint, changed-file formatting, migration synchronization, whitespace, and the production build.

The full repository format check still reports 220 baseline files outside this release diff.

The local browser run did not call OpenAI or other live providers.

## Verified production results

Production has 46 users, 45 brands, and 29 articles.

Production has zero brand-owner orphans.

Production has 112 checked application migration rows through migration 0111.

Production has three restricted roles.

The `venturecite_runtime` login exists.

The membership dry run, apply command, and post-apply audit passed.

A production-mode local boot showed that the runtime login cannot replace the current owner connection yet.

Legacy routes and system workers still need owner access.

The live `/health` endpoint returned HTTP 200 with `db: true`.

The authenticated read-only canary remains pending.

The production advisor reports one Auth security warning and 21 request-policy performance warnings.

## Remaining work

1. Run the authenticated canary against safe read paths.
2. Review live errors after the canary.
3. Enable leaked-password protection in Supabase Auth.
4. Plan the request-policy performance fixes as a separate migration.
5. Resolve owner access for legacy routes and system workers.
6. Decide and test the runtime role cutover.
7. Add verified privacy values last.

The privacy values require user-provided legal entity and contact details.
