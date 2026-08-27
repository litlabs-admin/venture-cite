-- Source: migrations/0082_competitor_tier_relevance.sql
-- SHA256: da9a356414d1f10c6932c2ec177d09fa8e3f6cbaf1ab27bc40668e7719597ab8

-- 0082_competitor_tier_relevance.sql
--
-- Phase 6 (competitors overhaul): split tracked competitors into a curated
-- "core" set and a broader "discovered" pool, and add a relevance score used
-- to rank the discovered pool in the new "All discovered" tab.
--
--   tier            "core" | "discovered"   (default "discovered")
--   relevance_score 0-100, NULL for manual / un-scored rows
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS + guarded backfill).

ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'discovered',
  ADD COLUMN IF NOT EXISTS relevance_score integer;

-- Backfill: manually-added competitors are, by definition, the user's curated
-- core set. AI profile-inferred rows are direct competitors and also belong in
-- core. Citation-mined and scheduler rows stay 'discovered'.
UPDATE competitors
  SET tier = 'core'
  WHERE discovered_by IN ('manual', 'ai')
    AND tier <> 'core';

-- Tab queries filter by (brand_id, tier); index it.
CREATE INDEX IF NOT EXISTS competitors_brand_tier_idx ON competitors (brand_id, tier);
