# Deployment runbook

## Safety boundary

Keep production read-only until every pre-release gate passes.

Do not deploy a Vercel preview with production variables. Verify the preview database and provider settings first.

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

Development rejects remote database, Supabase, OpenAI, OpenRouter, Resend, and Stripe settings by default.

Use loopback services and fake generation for local tests.

Set `ALLOW_REMOTE_DEVELOPMENT_SERVICES=true` only for an approved isolated session.

## Preview gates

1. Use the approved `venturecite-reset-preview` branch for empty-schema migration tests.
2. Use the approved `venturecite-reset-data-preview` branch for storage checks with copied data.
3. Use the branch session pooler URL for application migrations.
4. Set `NODE_ENV=development` and `ALLOW_REMOTE_DEVELOPMENT_SERVICES=true` only in that migration shell.
5. Set `SUPABASE_CUSTOM_ORM_PREVIEW=true` only for the application migration runner.
6. Set `SUPABASE_CUSTOM_ORM_PREVIEW_BASELINE` from the source branch ledger.
7. Use `0093_stripe_owned_trial.sql` for the current production baseline.
8. Run `npm run db:migrate`, never the production release command.
9. Keep `SUPABASE_CUSTOM_ORM_PREVIEW` unset or false for normal preview application tests.
10. Set `STRIPE_PRODUCT_SYNC=false`.
11. Use Stripe test keys and test catalogue identifiers only when checkout testing needs them.
12. Leave `RESEND_API_KEY` and `BUFFER_ENCRYPTION_KEY` unset.
13. Set `EMAIL_DELIVERY_ENABLED=false`.
14. Set `CONTENT_GENERATION_PROVIDER=fake` only with `NODE_ENV=development` and a loopback base URL.
15. Set `DISABLE_STARTUP_AUTOPILOT=true` and `DISABLE_STRIPE_SETUP=true` for local flow tests.
16. Use fake or test AI providers.
17. Deploy the preview with the isolated database and preview-only secrets.
18. Run the browser product flows.
19. Verify that no preview variable targets production.

The fake content provider accepts only `http://localhost`, `http://127.0.0.1`, or `http://[::1]`.

The application has no fake Resend or Buffer adapter. Unset those credentials when testing a preview.

The preview flag seeds only the known application baseline. The runner still checks checksums, applies later migrations, and holds an advisory lock.

The preview flag skips only the Supabase platform ledger reconciliation. The application ledger and TLS checks remain active.

Never set `SUPABASE_CUSTOM_ORM_PREVIEW=true` in production. Use `--with-data` only for the approved data-preview storage checks. Never deploy that branch, expose it to users, or use it for provider calls. Never use `supabase db reset --linked`.

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
