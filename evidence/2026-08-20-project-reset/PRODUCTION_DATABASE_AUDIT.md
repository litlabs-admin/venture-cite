# Production database audit

## Scope

The audit ran against the VentureCite production Supabase project.

The release used the approved CA certificate and strict TLS verification.

Read-only checks did not return user rows, brand rows, identifiers, emails, or secret values.

The release created fresh logical backups before applying migrations.

## Backup and restore proof

The release created fresh schema, role, full-data, Auth-data, and public-data backups.

The release recorded SHA-256 hashes for the backup files in the secure backup directory.

The release restored the production schema and public data into an isolated PostgreSQL container.

The isolated restore preserved 46 users, 45 brands, 29 articles, and zero brand-owner orphans.

The isolated restore applied migrations 0094 through 0111 successfully.

The isolated restore ended with 112 application migration rows and three restricted roles.

The restore made no provider calls, emails, payments, Buffer posts, push notifications, or deployment.

## Controlled production release

The controlled release applied migrations 0094 through 0111 to production.

The release used the application ledger in `public.schema_migrations`.

The release used one transaction per migration and a PostgreSQL advisory lock.

The release completed without a migration error.

Production now has 112 checked application-ledger rows.

The latest application migration is `0111_revoke_handle_new_user_execute_after_function_replace.sql`.

Production has 46 users, 45 brands, and 29 articles.

No brand has a missing owner.

Production has three restricted roles.

The restricted roles have no unsafe owner or database creation privileges.

## Runtime login

The release created the `venturecite_runtime` login.

The role membership dry run passed.

The role membership apply command passed.

The post-apply membership audit passed.

A production-mode local boot showed that this login cannot replace the current owner connection yet.

Legacy routes and system workers still need owner access.

The deployment did not switch to `venturecite_runtime`.

The current evidence does not claim a runtime cutover.

## Live health check

The live `/health` endpoint returned HTTP 200.

The health response reported `db: true`.

An authenticated application canary remains pending.

The post-release advisor reports one disabled leaked-password protection warning.

It also reports 21 request-policy initialization warnings.

## Safety result

No production data was deleted.

No production provider call occurred.

No email was sent.

No payment was created or captured.

No Buffer post or push notification occurred.

No deployment occurred.

The privacy legal entity and contact values remain pending.

## Remaining release gates

1. Run the authenticated canary against safe read paths.
2. Review the canary and production error logs.
3. Enable leaked-password protection in the Supabase Auth settings.
4. Plan the 21 request-policy performance changes as a separate migration.
5. Decide whether legacy routes and workers can use restricted access.
6. Configure the runtime login only after that review.
7. Add verified privacy values last.
