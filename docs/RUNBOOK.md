# Runbook

How to respond to common production incidents. Pre-launch this is a skeleton — fill in real procedures as incidents happen and post-mortems land.

> **Sentry**: errors → https://sentry.io/organizations/<org>/projects/venturecite/  *(set DSN in env first)*
> **Supabase**: dashboard → https://app.supabase.com
> **Stripe**: dashboard → https://dashboard.stripe.com
> **Resend**: dashboard → https://resend.com

---

## Incident response checklist

1. **Acknowledge** — note the start time, capture symptoms.
2. **Assess** — read recent Sentry issues, check `/health`, scan logs for the request ID.
3. **Mitigate** — restart, rollback, or feature-flag off the affected path. Mitigation > root cause.
4. **Communicate** — if customers are affected, post status. (Pre-launch: skip.)
5. **Resolve** — confirm with smoke test.
6. **Post-mortem** — within 48h, write up: timeline, impact, root cause, fix, prevention. Add a runbook entry below.

---

## Tracing a single request

Every request gets a UUID `x-request-id` header (preserved if upstream sent one). The same ID appears in:
- Pino log lines (server stdout / log aggregator)
- Sentry events (as a tag)
- Response headers (browser DevTools → Network)

**To debug a customer report**: ask for the request ID from the response, or grep logs by `userId`.

---

## Known scenarios

### Server fails to boot — env validation error
**Symptom**: server crashes at startup with "Environment validation failed:" listing keys.
**Cause**: missing or malformed env var.
**Fix**: compare `.env` to `.env.example`; add the missing key. Re-deploy.

### `/health` returns 503
**Symptom**: load balancer marks instance unhealthy.
**Cause**: DB unreachable, advisory-lock acquire fails, or service-role key revoked.
**Fix**:
1. Check Supabase status page.
2. Try connecting with `psql $DATABASE_URL`.
3. If pooler connections are exhausted, restart the app (pool drains on graceful shutdown).
4. If service-role key was rotated, update env + redeploy.

### Content worker stalled
**Symptom**: jobs accumulate in `content_generation_jobs.status = 'pending'`.
**Detect**:
```sql
SELECT status, COUNT(*) FROM content_generation_jobs
WHERE created_at > now() - interval '1 hour' GROUP BY status;
```
**Causes**:
- Worker not running (check `[contentWorker] started` log line on boot)
- OpenAI outage (check Sentry for `contentWorker.tick` errors)
- A single job is monopolizing the worker (`status = 'started'` for >10min triggers reset on next boot)
**Fix**:
- Restart the app — boot recovery resets stuck jobs to `pending`.
- If OpenAI is down: nothing to do; jobs will retry once the circuit closes.

### Weekly email job didn't run
**Symptom**: no `weekly report job done` log line on Sunday.
**Causes**:
- `RESEND_API_KEY` unset → cron is skipped (intentional)
- Cron crashed (check Sentry `scheduler.weekly-report`)
- Resend quota exceeded
**Fix**: re-trigger manually:
```bash
# In a Node REPL or one-off script:
import { runWeeklyReportJob } from "./server/scheduler";
await runWeeklyReportJob();
```

### Stripe webhook 4xx
**Symptom**: Stripe dashboard → Webhooks shows failed deliveries.
**Causes**:
- `STRIPE_WEBHOOK_SECRET` rotated but env not updated
- App restart mid-event (Stripe will retry)
- Idempotency table desync (rare)
**Fix**:
- Verify `STRIPE_WEBHOOK_SECRET` matches the active endpoint in Stripe.
- Re-send failed events from Stripe dashboard (idempotency-safe — duplicates are skipped).

### High Sentry error rate from one user
**Symptom**: same `userId` appears across many Sentry events.
**Diagnose**: filter Sentry by `user.id`. Check `audit_logs` (when Wave 2 lands) for unusual activity.
**Fix**:
- If accidental: contact the user.
- If abusive: rate-limit at the IP layer, then ban user via admin tools (when Wave 7.3 lands).

### Migration failed on boot
**Symptom**: server crashes with "Migration NNNN failed: ...".
**Cause**: SQL error, schema conflict, or partial-state from a previous failed run.
**Fix**:
1. Inspect `public.schema_migrations` — the failed migration won't be in there.
2. Read the SQL — fix or revert in a new migration `NN+1`.
3. **Never** edit a migration that's been applied to any environment. Always make a forward-fix migration.

### LLM cost spike
**Symptom**: OpenAI/OpenRouter dashboard shows unexpected token usage.
**Diagnose**: when Wave 3.2 lands, query `api_costs` table for top users.
**Mitigate**: reduce per-tier budget in `server/lib/llmBudget.ts`; redeploy.

---

## Manual operations

### Reset a stuck content generation job
```sql
UPDATE content_generation_jobs SET status = 'pending', errorMessage = NULL
WHERE id = '<job-id>' AND status = 'started';
```

### Force-update a user's tier (e.g. comp account)
```sql
UPDATE users SET access_tier = 'pro' WHERE id = '<user-id>';
```
Verify in Stripe portal afterward that the actual subscription matches.

### Replay a Stripe webhook
Stripe dashboard → Webhooks → select endpoint → Events → ⋯ → Resend.

### Cancel an in-flight cron run
There's currently no cancel mechanism — the job runs to completion. Restarting the server kills it.

---

## When this runbook isn't enough

- Re-check [`AUDIT.md`](../AUDIT.md) — the issue may already be a known finding with a planned fix.
- Search the codebase for the specific error message.
- If new, add an entry to this runbook after resolution.

---

## Schema state

- **Last drizzle-kit check:** 2026-05-04 — clean ("Everything's fine"). Re-run before each migration PR.
- **Last full migration audit:** 2026-05-04 — see "Migration audit" below.

### Migration audit (2026-05-04) — full sweep, 47 files

Audited every migration in `migrations/0000_*.sql` through `migrations/0046_*.sql` against 8 risk categories (destructive ops, NOT NULL without DEFAULT, missing IF NOT EXISTS, missing CONCURRENTLY on hot tables, missing FK indexes, non-idempotency, unsafe data mutation, CHECK constraints on existing data).

**Summary:**
- 1 P1 issue found and FIXED in this PR: `migrations/0011_prompt_generations.sql:11` was missing `IF NOT EXISTS` on `CREATE INDEX prompt_generations_brand_id_idx`. Theoretical risk only (the `schema_migrations` runner skips already-applied migrations on re-boot), but matters for partial-restore scenarios. One-line fix applied.
- All other 46 migrations are exemplary.
- All FK columns have indexes (cross-checked against `0003_fk_hardening.sql` blanket-index pass and per-migration follow-ups).
- All `CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `CREATE INDEX` use `IF NOT EXISTS` (after the 0011 fix).
- All data-mutating UPDATE/DELETE statements are idempotent (re-running matches 0 rows after first success).
- Destructive operations (DROP TABLE, DROP COLUMN) are guarded with `IF EXISTS` or wrapped in conditional `DO $$` blocks.

**Patterns to follow for new migrations (Phase 5+):**
1. Always use `IF NOT EXISTS` on every `CREATE TABLE`, `CREATE INDEX`, `ADD COLUMN`. Non-negotiable — every migration is auto-run on boot.
2. New `ADD COLUMN ... NOT NULL` requires `DEFAULT` (or place the column in a `DO` block confirming the table is empty).
3. Use `ON DELETE CASCADE` on FK to `users(id)` for GDPR compliance (existing convention).
4. Index every FK column explicitly — Drizzle's `references()` does NOT auto-create indexes.
5. For dedup-then-unique-index patterns, use a windowed `DELETE` (CTE with `ROW_NUMBER`) before the unique index, with `IF NOT EXISTS` on both.
6. Wrap multi-step schema changes in `BEGIN…COMMIT` for atomicity.
7. CHECK constraints added to existing tables need a `DO $$ ... END $$` block with exception handling.
8. Comment heavily — explain the business reason, idempotency guarantee, and any gotchas.

---

## Common incidents

### 1. Database connection pool exhausted

**Symptoms:**
- Vercel function logs show errors like `Error: Connection terminated unexpectedly` or `remaining connection slots are reserved`
- `/health` returns 503
- Sentry shows a spike of DB-related errors

**Immediate mitigation:**
- Trigger a fresh Vercel deploy. New function instances get fresh pool connections; old leaked connections will eventually be reclaimed by Postgres timeouts.
- Open Supabase dashboard → Database → Pool settings — confirm the pool isn't paused or stalled.

**Investigation:**
- Check `server/db.ts` — `max: isServerless ? 1 : 10`. On Vercel each function instance gets max=1 connection. Pool exhaustion in serverless usually means a long-running query holding the connection.
- Check Sentry for the slow query. Look at recent code changes for new heavy queries.

**Post-incident:**
- If a specific endpoint is implicated, add query timeouts or convert to a background job (cron orchestrator step).
- Consider upgrading Supabase to Pro for more connection headroom.

### 2. Stripe webhook signature failures

**Symptoms:**
- `/api/stripe/webhook` returning 400
- Stripe dashboard → Webhooks → recent deliveries showing failures
- Customers reporting "I paid but got no access"

**Immediate mitigation:**
- Confirm `STRIPE_WEBHOOK_SECRET` env var matches what's in Stripe dashboard → Webhooks → Endpoint signing secret.
- If secret has rotated, update the Vercel env var and redeploy.
- Stripe will retry failed webhooks for ~3 days, so urgency is medium-high but not minutes.

**Investigation:**
- Check `server/webhookHandlers.ts` for signature verification. The raw body must be passed to `stripe.webhooks.constructEvent`.
- Check `server/app.ts` ordering — `express.raw()` must be applied to `/api/stripe/webhook` BEFORE `express.json()`.

**Post-incident:**
- Webhook signing secrets should be rotated annually. Document rotation in this RUNBOOK.

### 3. OpenAI / OpenRouter 429 (rate limited or quota exhausted)

**Symptoms:**
- Sentry events tagged with OpenAI or OpenRouter origins
- Users see "AI service temporarily unavailable" in chatbot, content generation, or citation runs
- Status page may show degraded service

**Immediate mitigation:**
- Check provider's status page (status.openai.com or openrouter.ai/status) for outages.
- Check your account billing dashboards for spend caps hit.
- If a single user is monopolizing, look at recent `api_costs` rows for outliers.

**Investigation:**
- `server/lib/llmBudget.ts` defines daily spending caps. Check current spend in `api_costs` table.
- For chatbot specifically (post-Phase 5), check `chatbot_token_usage` table for the user.

**Post-incident:**
- Tighten per-user daily token budgets if abuse pattern observed.
- Consider routing to a different provider via `OPENROUTER_API_KEY` if persistent OpenAI issues.

### 4. LLM budget exceeded (your daily cap)

**Symptoms:**
- All AI features return 429 with "daily budget exceeded" type errors
- All users affected, not just one

**Immediate mitigation:**
- Increase the daily cap in `server/lib/llmBudget.ts` if the spend is intentional/expected.
- Roll back the cap once load normalizes.

**Investigation:**
- Query `api_costs` table grouped by `feature` to see what spent the budget.
- Check for runaway loops — most likely culprits: citation runs in a tight loop, autopilot misconfigured, abuse via prompt-test flows.

**Post-incident:**
- If a feature is structurally too expensive, redesign cost model (per-user daily limits, tier-gate the feature).

### 5. Stuck content generation jobs

**Symptoms:**
- `/api/content-jobs/active` shows jobs in `pending` or `running` for >10 minutes
- Users see articles "still generating" forever
- `failStuckContentJobs` cron step in daily orchestrator failing or no-op

**Immediate mitigation:**
- Run the orchestrator manually: `POST /api/cron/daily-orchestrator` with `Authorization: Bearer $CRON_SECRET`. The `fail-stuck-content-jobs` step will time-out anything stale.
- For specific jobs needing urgent recovery, query `content_generation_jobs` and manually update status to `failed` (triggers refund via `refundArticleQuota`).

**Investigation:**
- Read `server/contentGenerationWorker.ts` and `server/routes/content.ts` for the slice/advance logic.
- Check Sentry for `runArticleSlice` errors — silent failures here cause stuck jobs.

**Post-incident:**
- If a particular failure mode is recurring, add it as an explicit guard in the slice handler.

---

## Backup and restore

### Backup state

- **Provider:** Supabase Free tier — daily backups, 7-day retention, NO PITR
- **Worst-case data loss in disaster:** ~24 hours (last daily backup is the most recent restore point)
- **Last successful restore drill:** TBD (Task 15 of Phase 0 — to be performed by user)

### Restore procedure (Supabase Free)

1. Create a fresh Supabase project (or empty an existing staging project).
2. Export prod via `pg_dump`:
   ```
   pg_dump "postgres://[prod_uri]" --no-owner --no-acl --schema=public --file=backup.sql
   ```
3. Restore to target:
   ```
   psql "postgres://[target_uri]" -f backup.sql
   ```
4. Update Vercel env vars (DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) to point at the restored project.
5. Trigger a Vercel redeploy.
6. Smoke-test: log in, list brands, list articles, run a citation check.

### MUST upgrade before taking real money

Supabase Pro ($25/mo) is a launch-blocker for paying customers:
- Adds **point-in-time recovery (PITR)** — restore to any second within last 7 days (vs. nightly snapshots only on Free)
- Extends backup retention to 30 days
- Higher connection limits and storage cap (8 GB vs 500 MB)

Until upgrade: do NOT charge customers, or accept the worst-case-24h-data-loss risk explicitly with them.

---

## Status page

- **Public URL:** TBD (Task 16 of Phase 0 — to be set up by user via Better Stack free tier)
- **Provider:** Better Stack (free tier — 10 monitors, 1 status page)
- **Monitor:** `/health` endpoint checked every 1 minute
- **Alerts:** email to dev contact
- **Linked from:** landing page footer (TBD)
