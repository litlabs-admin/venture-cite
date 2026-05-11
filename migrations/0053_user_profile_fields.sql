-- Foundations Plan 3 Task 2: add timezone column for the expanded
-- Settings page profile form. firstName/lastName already exist on
-- the users table from earlier migrations.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone TEXT;
