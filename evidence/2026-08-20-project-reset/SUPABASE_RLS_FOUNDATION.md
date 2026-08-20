# Supabase RLS foundation

## Outcome

The local database now has a restricted request role for `users` and `brands`.

No application route uses this role yet.

No live database change occurred.

## Verified problem

The server creates one global PostgreSQL pool in `server/db.ts`.

The code does not set a database role or a request user value.

RLS is active on public tables, but the current database owner can bypass it.

Some brand writes use only a brand ID after a separate ownership check.

This split permits a future code defect to write another user's row.

## Local design

Migration 0096 creates the `venturecite_request` role.

The role has no login access and cannot bypass RLS.

The role does not belong to `anon` or `authenticated`.

The role can read only approved user columns.

The role cannot read password, Stripe, Buffer, or billing fields.

The role can read brand rows only when `user_id` matches the request user.

The role can insert and update only approved brand columns.

The role cannot hard delete a brand.

Migration 0096 does not grant the request role to the application login.

`requestData.forUser` starts a short transaction.

It sets the fixed request role with `SET LOCAL ROLE`.

It sets `venturecite.user_id` with a bound query value.

PostgreSQL clears both values after commit or rollback.

## Local proof

The integration test uses the local Supabase database on port 55322.

Ten tests pass.

The tests prove these facts.

- A user sees only their user row.
- A user sees only their brands.
- A cross-user update affects zero rows.
- All hard delete operations fail.
- Cross-user insert and ownership changes fail with PostgreSQL code `42501`.
- Approved profile updates work.
- Billing-tier updates fail.
- Password-hash reads fail.
- The role and user value clear after commit and rollback.
- Migration 0096 applies more than once.
- The request role keeps all restricted role attributes.
- The migration rejects active role members.
- The migration rejects admin-only role members.
- The migration rejects column access outside `users` and `brands`.
- A separate local runtime login can use `SET LOCAL ROLE`.

## Release limits

Do not connect live routes to this role yet.

Do not apply migration 0096 to production yet.

The live metadata audit must confirm the production login role and grants.

The live audit must also count brands with a null or invalid `user_id`.

The Supabase project CA remains a release blocker for that audit.

The legal entity and privacy email remain public-release blockers.

## Security limit

This design protects against missing tenant filters.

It does not protect against arbitrary SQL under the owner connection.

The callback can run only trusted repository code.

Future route work must use named request repositories.

The owner database object must stay outside request routes.

## Sources

- [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Postgres roles guide](https://supabase.com/docs/guides/database/postgres/roles)
- [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [PostgreSQL SET ROLE](https://www.postgresql.org/docs/current/sql-set-role.html)
