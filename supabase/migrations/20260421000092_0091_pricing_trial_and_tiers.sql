-- Source: migrations/0091_pricing_trial_and_tiers.sql
-- SHA256: 177e244142b33967fa7708121c5bcf2294f710eba9a1125494ad5863a45c4c0c

-- Pricing restructure: two sellable plans (Pro $99, Agency $500) plus a
-- 14-day signup trial that Stripe knows nothing about.
--
-- Safe to run against production as it stands: at the time of writing there
-- are 36 accounts and ZERO Stripe subscriptions (verified:
--   select access_tier, count(*), count(stripe_subscription_id) from users
--   group by 1  ->  free 30/0, pro 6/0).
-- So there is no live billing state to migrate, no proration to worry about,
-- and no price grandfathering. If that stops being true before this ships,
-- re-check the pro -> agency step below, which would otherwise re-tier paying
-- customers.

-- 1. Trial window. NULL means "no trial applies": every existing account keeps
--    its current entitlements untouched, and only new signups get a stamp.
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at timestamp;

-- 2. The 6 accounts currently on "pro" predate this pricing and were granted
--    by hand, not paid for. "Pro" now means the $99 tracking plan, which has
--    NO article generation - leaving them on it would silently take away the
--    40 articles/month they have today.
--
--    They move to "agency" instead: 40 articles kept, brand cap raised 5 -> 10.
--    Nothing is lost, which is what "leave the existing accounts as they are"
--    was asked for. Scoped to rows with no subscription so a real paying Pro
--    customer (none today) could never be swept up by this.
UPDATE users
SET access_tier = 'agency'
WHERE access_tier = 'pro'
  AND stripe_subscription_id IS NULL;

-- The 30 "free" accounts are deliberately left alone. Free is no longer sold
-- and is absent from the pricing page, but it remains a valid tier so those
-- accounts keep working exactly as before.
