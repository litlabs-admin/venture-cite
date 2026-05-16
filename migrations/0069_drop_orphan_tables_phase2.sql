-- Tier 2B orphan cleanup (phase 2): drop tables whose backing client UIs
-- were removed in earlier waves (ai-traffic, ai-sources/publication-
-- intelligence, revenue-analytics). The corresponding routes, storage
-- methods, ownership helpers, schema definitions, and webhook handler
-- (Shopify orders, which fed purchase_events) have all been deleted.
-- CASCADE because each of these had child FKs pointing into it from
-- nothing live; this is just hygiene.

DROP TABLE IF EXISTS ai_traffic_sessions CASCADE;
DROP TABLE IF EXISTS ai_sources CASCADE;
DROP TABLE IF EXISTS purchase_events CASCADE;
DROP TABLE IF EXISTS publication_references CASCADE;
DROP TABLE IF EXISTS publication_metrics CASCADE;
