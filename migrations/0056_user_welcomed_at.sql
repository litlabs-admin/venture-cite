-- Plan 4 audit (BUG #13): the `last_login_at` column was repurposed in
-- migration 0054 as a welcome-email gate, with all existing rows
-- backfilled to NOW(). That broke its semantic meaning: callers reading
-- "when did this user last log in?" get the backfill timestamp instead
-- of a real login. Introduce a dedicated `welcomed_at` column for the
-- welcome-email gate so `last_login_at` can recover its literal meaning.
--
-- Backfill semantics: every existing user is treated as "already
-- welcomed" (same as the 0054 intent) so no welcome email surprise on
-- their next login.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS welcomed_at TIMESTAMP;

UPDATE users SET welcomed_at = NOW() WHERE welcomed_at IS NULL;
