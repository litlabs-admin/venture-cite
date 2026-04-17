-- Persist "has the user opened the AI Visibility Guide" server-side so the
-- onboarding step completion syncs across browsers and devices.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS visibility_guide_visited_at TIMESTAMP;
