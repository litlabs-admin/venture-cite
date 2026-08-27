-- Source: migrations/0054_user_last_login_at.sql
-- SHA256: 697657d899ab7c36127047df54fd525cd13c212e2463e6a44f62d56a71859662

-- Track the user's first verified login so the
-- backend can fire a one-time welcome email. Backfill existing rows to
-- "now" so test accounts and previously-registered users don't suddenly
-- receive a welcome email on their next login. Going forward, new rows
-- default to NULL (first login flips it) - that's what the welcome-email
-- trigger keys off of.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- Backfill: every existing user is treated as "already greeted".
UPDATE users SET last_login_at = NOW() WHERE last_login_at IS NULL;
