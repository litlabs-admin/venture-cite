-- Optimistic-lock version columns (Wave 4.4).
--
-- Pattern: every row carries an integer `version`. Reads return the
-- current version; writes must include `WHERE version = $expected` and
-- bump it by 1. If the WHERE matches 0 rows (someone else wrote in
-- between), the request returns 409 Conflict and the client refetches
-- and retries.
--
-- Why integer vs comparing updated_at: ms-precision timestamps can
-- collide for two writes in the same millisecond, AND the client
-- round-trip serializes/deserializes the timestamp which can subtly
-- alter comparison. A monotonically-increasing integer is bulletproof.

alter table public.brands
  add column if not exists version integer not null default 0;

alter table public.articles
  add column if not exists version integer not null default 0;
