# Supabase migration report

## Current state

VentureCite already uses Supabase Auth, Storage, and PostgreSQL.

The Express server connects to PostgreSQL through `pg.Pool` and Drizzle.

The server also uses the Supabase service role for approved server operations.

Tenant isolation still depends on application ownership checks.

Existing RLS settings do not yet prove safe tenant isolation.

## Completed work

- Added a pre-`0000` schema baseline from Git commit `45d3d8f7e60c6fec3216ae72ad703e048695f7b1`.
- Added checksum-linked Supabase copies for migrations `0000` through `0095`.
- Rebuilt an empty local Supabase database through the complete migration chain.
- Passed 34 database integration tests against the rebuilt local database.
- Removed migration execution from the build and application startup.
- Added an explicit production migration command.
- Added a production confirmation gate.
- Added SHA-256 checks for recorded migration files.
- Added a read-only database metadata audit command.

## Live audit blocker

The production environment lacks a configured Supabase CA path.

Default certificate verification failed with a self-signed certificate-chain error.

The audit stopped before its metadata query.

Download the project certificate from the Supabase Database Settings page.

Set `DATABASE_CA_CERT_PATH` to the deployed certificate path.

Do not set an unverified TLS mode.

Supabase recommends `verify-full` with the project certificate.

Source: [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).

## Safe migration order

1. Run the metadata audit with strict TLS.
2. Record the application role, table owners, grants, RLS flags, and policy counts.
3. Create separate migration, request, and worker roles.
4. Move `users` and `brands` to request-scoped RLS first.
5. Test two users and two brands against every ownership boundary.
6. Move articles, content jobs, citations, and fact-sheet tables next.
7. Replace process-local limits and leases with PostgreSQL-backed operations.
8. Add an outbox for Stripe, Resend, Buffer, and AI provider effects.
9. Remove the service role from normal tenant queries.
10. Enable each production policy through a small canary release.

Use a direct or session connection for migration jobs.

Use a transaction pooler for short serverless requests.

Source: [Supabase PostgreSQL connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Release gates

- The public privacy page needs the approved legal entity and privacy email.
- Production needs the project CA file.
- Production needs exact Stripe Pro and Agency product and price IDs.
- The live role and policy audit must pass.
- The complete static and test checks must pass after the final configuration change.
- No test can send email to a real recipient.
- No migration can run during an application build or startup.
