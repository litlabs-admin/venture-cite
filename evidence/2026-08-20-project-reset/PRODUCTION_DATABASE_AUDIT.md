# Production database audit

## Scope

The audit ran on 2026-08-20 through the configured production `DATABASE_URL`.

The supplied Supabase CA verified the TLS connection.

The audit used one read-only transaction and a five-second statement timeout.

The audit ended with `ROLLBACK`.

It returned catalog facts and aggregate ownership counts only.

It did not return user rows, brand rows, identifiers, emails, role names, URLs, or secret values.

## Current metadata recheck

On 2026-08-22, the direct-session audit was attempted with the supplied CA certificate. This workstation could not open the direct database host, so the script stopped before any query.

The authenticated Supabase Management API then ran SELECT-only metadata queries. It confirmed 62 public relations, 62 relations with RLS, zero policies on `users` and `brands`, and no `venturecite_request` role.

The production application ledger currently has 94 rows through `0093_stripe_owned_trial.sql`. All 94 rows have no checksum. Migrations `0094` through `0111` remain absent.

The current login is `postgres`. It can bypass RLS, create roles, create databases, and holds nine granted roles. The only public function is `handle_new_user()`. It is security definer, sets `search_path=public`, and grants execution only to `postgres` and `service_role`.

These Management API checks did not write data. The direct-session audit, backup proof, and release preflight remain required gates.

The production Supabase advisor reports one `auth_leaked_password_protection` warning. This Auth setting remains a release gate.

## Results

- The public schema has 62 relations.
- All 62 relations have RLS enabled.
- No relation forces RLS.
- All 62 relations have an owner that can bypass RLS.
- The runtime login can bypass RLS.
- The runtime login can create roles and databases.
- `users` has RLS enabled and zero policies.
- `brands` has RLS enabled and zero policies.
- The public schema has no PUBLIC table or column grants.
- The `venturecite_request` role does not exist in production.
- No brand has a missing owner.
- No brand refers to an unknown user.

## Decision

This decision records the production state before the current branch added migration 0110 and the brand request-route cutover.

Do not activate request repositories in production under the current deployment.

Complete the local route cutover and cross-user tests first.

Apply migrations through a controlled release only after the final review.

Keep worker and administrator access separate from request repositories.

Create a least-privileged runtime login before the last production rollout.

## Open item

`DATABASE_DIRECT_URL` is absent from the secure local environment source.

The direct-connection audit cannot run until the release environment provides that value and the release host can reach the direct database endpoint.

Do not copy a database URL into a command, report, or Git file.
