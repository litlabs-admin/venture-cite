-- Source: migrations/0014_user_onboarding_flags.sql
-- SHA256: dd6c008cb2a20e105805e3f1e27db367c708f79ba73da389e029360101029286

-- Persist "has the user opened the AI Visibility Guide" server-side so the
-- onboarding step completion syncs across browsers and devices.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS visibility_guide_visited_at TIMESTAMP;
