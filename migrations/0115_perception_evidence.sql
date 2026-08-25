-- Perception: keep the evidence, and say why an axis was not judged.
--
-- The score was previously asserted with nothing behind it: the snippets that
-- produced it were used for one LLM call and discarded, and an axis the judge
-- could not assess rendered as a blank the reader could not interpret
-- ("broken?" vs "genuinely nothing said about pricing").
--
-- evidence            [{text, platform}] - the quotes that produced the score
-- evidence_platforms  which engines those quotes came from
-- axis_notes          {axis: reason} for every axis that came back null
--
-- All nullable: rows written before this migration keep their score and simply
-- render without the evidence panel, rather than being backfilled with quotes
-- nobody actually captured.
ALTER TABLE public.brand_perception_runs
  ADD COLUMN IF NOT EXISTS evidence JSONB,
  ADD COLUMN IF NOT EXISTS evidence_platforms TEXT[],
  ADD COLUMN IF NOT EXISTS axis_notes JSONB;
