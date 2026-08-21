# Deployment runbook

## Safety boundary

Keep production read-only until every pre-release gate passes.

Do not deploy the current Vercel preview with production variables.

Create an isolated Supabase preview database and test provider configuration first.

Do not send test email to real users.

## Local gates

Run these commands from a clean worktree.

```sh
npm run check
npm run lint
npm run format:check
npm test
npm run supabase:migrations:check
npm run build
```

Run the local product-flow suite against local Supabase.

Do not use production credentials for this suite.

## Preview gates

1. Create an isolated Supabase project or branch.
2. Use Stripe test keys and test catalogue identifiers.
3. Disable real Resend delivery.
4. Use fake or test AI providers.
5. Deploy the preview.
6. Run the browser product flows.
7. Verify that no preview variable targets production.

## Production read-only gates

1. Take a database backup and verify the restore procedure.
2. Run `npm run release:preflight`.
3. Run the metadata audit through the direct session URL.
4. Review roles, grants, RLS flags, policies, and ownership counts.
5. Verify strict TLS with the approved Supabase CA.
6. Verify the runtime and direct URLs target the same database.

Do not log database URLs, role names, CA paths, or secret values.

## Migration and role gates

Set the explicit migration confirmation in the secure release shell.

Run `npm run db:migrate:release` once.

Run `npm run db:configure-request-roles` in dry-run mode.

Apply the role memberships only after the dry run passes.

Record the applied migration names and checksums in the release record.

The release runner reconciles matching Supabase migration rows before it executes SQL.

Stop the release if the Supabase ledger is missing a root file or has a checksum mismatch.

## Deployment gates

1. Deploy the application after the migration and role steps pass.
2. Check `GET /health`.
3. Test sign-in with an approved test account.
4. Test one brand and article path.
5. Test generation, cancellation, and distribution with safe inputs.
6. Test Stripe checkout with the approved production catalogue.
7. Check logs and Sentry for new errors.
8. Stop the release if an ownership, billing, or migration check fails.

## Final privacy gate

Add the verified legal entity and privacy contact address last.

Review the rendered public privacy page before the production release.
