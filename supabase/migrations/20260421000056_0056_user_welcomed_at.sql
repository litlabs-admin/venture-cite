-- Source: migrations/0056_user_welcomed_at.sql
-- SHA256: 28bc50665115a0f8da226d2eb84d189704a3d34ec4757888a65cbbc6473a49d0

-- The `last_login_at` column was repurposed in
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
