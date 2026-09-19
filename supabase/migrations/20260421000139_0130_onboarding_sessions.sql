-- Source: migrations/0130_onboarding_sessions.sql
-- SHA256: 89a388c61440a38b408a180e3d0a1f4a40ef2a46b2e455be07c1bd368d0493ff

-- Anonymous onboarding sessions. The new onboarding runs before sign-up, so
-- its results live here until an account claims them.
-- Spec: docs/superpowers/specs/2026-09-18-onboarding-data-contract.md.
--
-- events is an append-only list of {type, data} objects, validated against
-- shared/onboarding/session.ts before they are written. The SSE route replays
-- it on reconnect, so a dropped connection loses nothing.
--
-- ip_hash is a salted SHA-256 of the client IP, never the raw address. It
-- backs the 5-per-hour limit and nothing else.
--
-- Only the application pool reads this table. RLS is enabled with no
-- policies, the same backstop posture as 0126_ask_core.sql.

CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain            text NOT NULL,
  ip_hash           text NOT NULL,
  status            text NOT NULL DEFAULT 'running',
  events            jsonb NOT NULL DEFAULT '[]'::jsonb,
  answers           jsonb,
  claimed_by        varchar REFERENCES public.users(id) ON DELETE SET NULL,
  claimed_brand_id  varchar REFERENCES public.brands(id) ON DELETE SET NULL,
  claimed_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  CONSTRAINT onboarding_sessions_status_check
    CHECK (status IN ('running', 'done', 'failed')),
  CONSTRAINT onboarding_sessions_events_array_check
    CHECK (jsonb_typeof(events) = 'array'),
  CONSTRAINT onboarding_sessions_claim_pair_check
    CHECK ((claimed_by IS NULL) = (claimed_at IS NULL))
);

-- The rate limit counts one IP's sessions in the last hour.
CREATE INDEX IF NOT EXISTS onboarding_sessions_ip_recent_idx
  ON public.onboarding_sessions (ip_hash, created_at DESC);

-- Expiry sweep. Claimed sessions are kept: the brand points back at its source.
CREATE INDEX IF NOT EXISTS onboarding_sessions_unclaimed_expiry_idx
  ON public.onboarding_sessions (expires_at)
  WHERE claimed_by IS NULL;

ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
