-- Source: migrations/0088_brand_perception_runs.sql
-- SHA256: c7668cd85e6b5d714663db56afd3272eb75a1df4afd29cb8ced93cf646e661e7

-- Brand perception scoring: five dimensions, judged from what AI models
-- actually said about the brand.
--
-- WHY A TABLE AND NOT AN ON-DEMAND COMPUTE: scoring costs an LLM call over a
-- sample of stored answers, so it cannot run on every dashboard render. Runs
-- are persisted, the dashboard reads the newest one, and keeping history is
-- what eventually makes a perception TREND possible (the reference charts
-- exactly that once a brand has more than one run).
--
-- HONESTY CONSTRAINTS BAKED INTO THE SHAPE:
--   * Every dimension column is NULLABLE. A judge that could not assess an
--     axis from the available evidence records NULL, never a middling 50.
--   * `evidence_count` records how many real answer snippets the score was
--     derived from. A score computed from 3 snippets is not the same claim as
--     one computed from 400, and the UI needs to be able to say so.
--   * `model` records which judge produced it, so a score is never orphaned
--     from the thing that made it.
-- Scores are 0-100 integers.

CREATE TABLE IF NOT EXISTS public.brand_perception_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,

  -- The five axes the reference product scores.
  trust            INTEGER,
  quality          INTEGER,
  value            INTEGER,
  market           INTEGER,
  innovation       INTEGER,
  -- Mean of whichever axes were scorable. NULL when none were.
  overall          INTEGER,

  -- Free-text lists the judge extracted, mirroring the reference's
  -- "praised / questioned" columns. Plain text arrays, no separate table:
  -- they are display-only and always read as a whole.
  praised          TEXT[] NOT NULL DEFAULT '{}',
  questioned       TEXT[] NOT NULL DEFAULT '{}',

  evidence_count   INTEGER NOT NULL DEFAULT 0,
  model            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The dashboard's only query is "newest run for this brand", and the history
-- view will be "runs for this brand, newest first" - one index serves both.
CREATE INDEX IF NOT EXISTS brand_perception_runs_brand_created_idx
  ON public.brand_perception_runs (brand_id, created_at DESC);

-- Same posture as migration 0081: RLS on, no policies. Written only by the
-- Express API over the Drizzle owner connection, which is not subject to RLS;
-- default-denies the anon/authenticated PostgREST roles.
ALTER TABLE public.brand_perception_runs ENABLE ROW LEVEL SECURITY;
