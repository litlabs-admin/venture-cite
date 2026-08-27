-- Onboarding autopilot: make the recovery sweep able to see stranded brands.
--
-- The activation pipeline already runs automatically on brand creation, but
-- 72% of brands never finished it. Two states were invisible to the recovery
-- sweep, which selected only:
--
--   autopilot_status IN ('pending','scraping_facts','generating_prompts',
--                        'running_citations')
--
--   'idle'   - the brand was created but autopilot never wrote ANY status.
--              runOnboardingAutopilot does two awaits and an early
--              deadline return BEFORE its first status write, so a kickoff
--              that arrived late (or whose serverless function was killed
--              after the response was sent - it is launched detached via
--              waitUntil) left the row exactly as created: 'idle'. The
--              kickoff comment promises "whatever doesn't finish within the
--              deadline is driven to completion by the daily cron", which was
--              simply false for this state.
--
--   'failed' - a TRANSIENT error (provider 429, deadline abort) terminally
--              killed onboarding. Observed in production: two "429 exceeded
--              your current quota", one "429 no credits remaining", one
--              "This operation was aborted". Nothing retried them; the only
--              recovery was a manual retry button the user had to find.
--
-- These two columns let the sweep retry those states with a bounded attempt
-- count and a backoff, instead of retrying forever and burning provider spend
-- on a brand that is genuinely broken.
--
-- DELIBERATE: existing stranded rows are seeded at the attempt cap so this
-- migration does NOT trigger a mass re-run of historical brands. Onboarding a
-- brand costs real money (measured $0.15-$3.00 in api_costs), and several
-- stranded rows are smoke/E2E test brands where that spend would be pure
-- waste. The mechanism goes live for NEW brands only. To deliberately
-- backfill specific brands later, reset their counter:
--
--   UPDATE brands SET autopilot_attempts = 0 WHERE id = '<brand-id>';

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS autopilot_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS autopilot_last_attempt_at timestamptz;

-- Seed every EXISTING brand at the cap (5) so the new sweep ignores them.
-- New rows get the DEFAULT 0 and are eligible immediately.
--
-- The age guard makes this safe if the statement is ever replayed (applied
-- out-of-band, restored into a database whose ledger disagrees, etc). Without
-- it, a replay would silently seed every brand created since the first run at
-- the cap - permanently stranding exactly the new brands this whole change
-- exists to rescue. The runner records filename+checksum in
-- public.schema_migrations so a replay should not happen; this is belt and
-- braces because the failure mode is invisible.
UPDATE brands
SET autopilot_attempts = 5
WHERE autopilot_attempts = 0
  AND created_at < now() - interval '1 minute';

-- The sweep filters on (status, attempts, last_attempt_at). Partial index
-- keyed to the retryable states only - the completed majority never needs
-- scanning, and this keeps the daily cron's sweep cheap as brand count grows.
CREATE INDEX IF NOT EXISTS brands_autopilot_retry_idx
  ON brands (autopilot_status, autopilot_attempts, autopilot_last_attempt_at)
  WHERE deleted_at IS NULL
    AND autopilot_status IN ('idle', 'failed', 'pending', 'scraping_facts',
                             'generating_prompts', 'running_citations');
