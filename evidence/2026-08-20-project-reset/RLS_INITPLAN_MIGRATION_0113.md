# RLS initialization-plan migration 0113

Migration 0113 updates the 21 audited active policies that use request context.

It changes only the expression shape for `venturecite.user_id` and `venturecite.outbox_user_id`.

Each expression now evaluates `current_setting` inside a statement-level scalar query.

The migration uses `ALTER POLICY`.

It preserves each policy role, command, `USING` predicate, and `WITH CHECK` predicate.

The root migration and Supabase mirror share one SHA-256 header.

Focused proof:

- `tests/unit/rlsInitplanMigrationShape.test.ts`
- `npm run supabase:migrations:check`
- Prettier check on the changed files
- `git diff --check`

The controlled release applied this change to production on 2026-08-22.

The production ledger has 114 checked rows through migration 0113.

All 21 audited policies use the new expression form.

The Supabase advisor reports no database performance warning.
