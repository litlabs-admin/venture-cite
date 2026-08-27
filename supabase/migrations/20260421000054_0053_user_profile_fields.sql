-- Source: migrations/0053_user_profile_fields.sql
-- SHA256: 976303957d1cc7126e74daed38b3f9e60b91dbd6747db12aceff0aaed7d70b0b

-- Add a timezone column for the expanded
-- Settings page profile form. firstName/lastName already exist on
-- the users table from earlier migrations.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone TEXT;
