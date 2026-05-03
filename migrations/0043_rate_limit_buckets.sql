-- Wave 9.5 / Vercel migration: durable rate-limit token buckets.
--
-- The previous in-memory Map (server/lib/rateLimitBuckets.ts) only worked
-- on a single-process deployment. On serverless each lambda has its own
-- Map, so the limit becomes per-lambda instead of global → users can burn
-- N×lambdas of an upstream's quota. This table moves bucket state into
-- Postgres so all callers share it.

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  provider        TEXT        NOT NULL,
  scope_id        TEXT        NOT NULL,
  tokens          NUMERIC     NOT NULL,
  last_refill_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, scope_id)
);
