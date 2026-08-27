-- Source: migrations/0116_perception_probes.sql
-- SHA256: 269bc485e904da532a769c6543e4442640c569831fbfd65426d5409777811e43

-- Perception probes: ask each engine directly, instead of inferring.
--
-- The existing brand_perception_runs scores five axes from leftovers - the
-- stored answers to CITATION prompts ("best PR agencies for robotics"), which
-- are not questions about the brand. That measures something real (how the
-- brand reads when it happens to come up) but it cannot answer "what does
-- ChatGPT think of us", and it structurally starves some axes: an answer
-- listing agencies almost never discusses pricing, so `value` came back null
-- on essentially every run.
--
-- This pipeline asks each engine five purpose-written questions - one per axis
-- - with live web grounding, and scores each engine's OWN answers separately.
-- The result is a per-engine x per-axis matrix rather than one blended number.
-- It shares no inputs with the derived score; both are kept, because they
-- answer different questions.
--
-- HONESTY: every probe explicitly invites "if you have no information about
-- this company, say so". An engine that knows nothing is a real, reportable
-- finding - `no_information = true` with a NULL score - and the CHECK below
-- makes the "confident score from an admitted non-answer" state unstorable.

CREATE TABLE IF NOT EXISTS public.brand_perception_probe_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  -- pending -> running -> succeeded | partial | failed
  -- 'partial' is a first-class outcome: one engine failing must not discard
  -- the five that answered.
  status TEXT NOT NULL DEFAULT 'pending',
  probes_total INTEGER NOT NULL DEFAULT 0,
  probes_done INTEGER NOT NULL DEFAULT 0,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.brand_perception_probes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.brand_perception_probe_runs(id) ON DELETE CASCADE,
  brand_id VARCHAR NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  axis TEXT NOT NULL,
  -- The exact question asked. Stored per row, not reconstructed from a
  -- template at read time: if the wording is ever tuned, an old row must keep
  -- showing what was actually asked to produce its score.
  question TEXT NOT NULL,
  -- pending -> asked -> scored | failed
  status TEXT NOT NULL DEFAULT 'pending',
  -- The engine's verbatim answer, so every score stays auditable.
  answer TEXT,
  -- URLs the engine grounded on, [{url, title}].
  sources JSONB,
  score NUMERIC(4, 1),
  -- The engine said it had no information about this brand. Distinct from a
  -- failed call (error_message) and from a low score - "nobody has heard of
  -- you" and "people think poorly of you" are opposite findings.
  no_information BOOLEAN NOT NULL DEFAULT FALSE,
  -- One line on what the answer supports, or why no score was possible.
  note TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  -- An admitted non-answer can never carry a number.
  CONSTRAINT brand_perception_probes_no_info_has_no_score
    CHECK (NOT (no_information AND score IS NOT NULL)),
  CONSTRAINT brand_perception_probes_score_range
    CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  -- One probe per (run, platform, axis). Makes the slice runner's resume step
  -- idempotent: a retried slice cannot double-insert the same cell.
  CONSTRAINT brand_perception_probes_unique_cell UNIQUE (run_id, platform, axis)
);

CREATE INDEX IF NOT EXISTS brand_perception_probe_runs_brand_id_idx
  ON public.brand_perception_probe_runs (brand_id);
CREATE INDEX IF NOT EXISTS brand_perception_probe_runs_started_at_idx
  ON public.brand_perception_probe_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS brand_perception_probes_run_id_idx
  ON public.brand_perception_probes (run_id);
-- The slice runner's hot path: "next pending probes for this run".
CREATE INDEX IF NOT EXISTS brand_perception_probes_run_status_idx
  ON public.brand_perception_probes (run_id, status);

-- Same posture as every other table in this app: RLS on, no policies - access
-- is mediated entirely by the server's own ownership checks.
ALTER TABLE public.brand_perception_probe_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_perception_probes ENABLE ROW LEVEL SECURITY;
