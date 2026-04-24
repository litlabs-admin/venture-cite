-- Wave 2 + Wave 3: Give competitor citation detection the same fidelity
-- as brand citation detection (per-run, per-prompt, per-platform rows with
-- LLM-judged rank + relevance + snippet) AND let AI citations feed the
-- unified brand_mentions table.
--
-- The old `competitor_citation_snapshots` table stored only an aggregate
-- count per (competitor, platform, run). That can't answer "which prompt
-- cited HubSpot on Claude?" and has no context/snippet for the mention.
-- New `competitor_geo_rankings` mirrors `geo_rankings` for competitors.

CREATE TABLE IF NOT EXISTS competitor_geo_rankings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  competitor_id VARCHAR NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  run_id VARCHAR NOT NULL REFERENCES citation_runs(id) ON DELETE CASCADE,
  brand_prompt_id VARCHAR NOT NULL REFERENCES brand_prompts(id) ON DELETE CASCADE,
  ai_platform TEXT NOT NULL,
  is_cited INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NULL,
  relevance_score INTEGER NULL,
  citation_context TEXT NULL,
  citing_outlet_url TEXT NULL,
  checked_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cgr_unique_per_run_prompt_platform_idx
  ON competitor_geo_rankings (competitor_id, run_id, brand_prompt_id, ai_platform);
CREATE INDEX IF NOT EXISTS cgr_competitor_idx ON competitor_geo_rankings (competitor_id);
CREATE INDEX IF NOT EXISTS cgr_run_idx ON competitor_geo_rankings (run_id);
CREATE INDEX IF NOT EXISTS cgr_brand_prompt_idx ON competitor_geo_rankings (brand_prompt_id);

-- ────────────────────────────────────────────────────────────────────────
-- brand_mentions unified with AI citations
-- ────────────────────────────────────────────────────────────────────────
-- Citation runs now write one brand_mentions row per cited (brand, prompt,
-- platform, run). Uniqueness is enforced on the tuple so re-ingest is a
-- no-op. `source_url` uses a synthetic `ai://` URI for AI-citation rows
-- that don't have a real outlet URL; organic rows (Reddit, HN) continue
-- to use the real source URL.
--
-- Preflight dedup existing rows first so the unique index can be created.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY brand_id, platform, source_url
           ORDER BY discovered_at ASC, id ASC
         ) AS rn
  FROM brand_mentions
)
DELETE FROM brand_mentions m
 USING ranked r
 WHERE m.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS brand_mentions_dedup_idx
  ON brand_mentions (brand_id, platform, source_url);
