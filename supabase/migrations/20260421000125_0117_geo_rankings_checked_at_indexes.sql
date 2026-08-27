-- Source: migrations/0117_geo_rankings_checked_at_indexes.sql
-- SHA256: caaa4b53e2ed5d29d6c579b68a5789b1a5115302ee38a6353730b608b7086139

-- migrate:no-transaction
--
-- These indexes use CREATE INDEX CONCURRENTLY because live citation runs write
-- to both tables. The migration runner must not wrap these statements in a
-- transaction, because PostgreSQL does not allow concurrent index creation in
-- a transaction block.
--
-- The cited-query indexes are partial because those queries only read rows
-- where is_cited = 1. Every statement is idempotent for safe reruns after a
-- non-transactional migration applies only part of this file.

create index concurrently if not exists geo_rankings_brand_prompt_id_checked_at_idx
  on geo_rankings (brand_prompt_id, checked_at desc);

create index concurrently if not exists geo_rankings_article_id_checked_at_idx
  on geo_rankings (article_id, checked_at desc);

create index concurrently if not exists geo_rankings_bp_cited_checked_at_idx
  on geo_rankings (brand_prompt_id, checked_at desc)
  where is_cited = 1;

create index concurrently if not exists cgr_competitor_id_checked_at_idx
  on competitor_geo_rankings (competitor_id, checked_at desc);

create index concurrently if not exists cgr_competitor_cited_checked_at_idx
  on competitor_geo_rankings (competitor_id, checked_at desc)
  where is_cited = 1;
