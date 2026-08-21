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
2. Set `STRIPE_PRODUCT_SYNC=false`.
3. Use Stripe test keys and test catalogue identifiers only when checkout testing needs them.
4. Leave `RESEND_API_KEY` and `BUFFER_ENCRYPTION_KEY` unset.
5. Set `CONTENT_GENERATION_PROVIDER=fake` only with `NODE_ENV=development` and a loopback base URL.
6. Set `DISABLE_STARTUP_AUTOPILOT=true` and `DISABLE_STRIPE_SETUP=true` for local flow tests.
7. Use fake or test AI providers.
8. Deploy the preview with the isolated database and preview-only secrets.
9. Run the browser product flows.
10. Verify that no preview variable targets production.

The fake content provider accepts only `http://localhost`, `http://127.0.0.1`, or `http://[::1]`.

The application has no fake Resend or Buffer adapter. Unset those credentials when testing a preview.

Stripe test mode grants test entitlements but never charges a card. Do not treat it as production billing proof.

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
