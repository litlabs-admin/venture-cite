-- Server-side onboarding state (Wave 4.7).
--
-- Today the 3 onboarding UIs (GuidedOnboarding, OnboardingChecklist,
-- SidebarOnboarding) all persist their "user has seen X" / "user
-- dismissed Y" state in localStorage. That breaks two things:
--   - User signs in on a second device → onboarding pops up again.
--   - User clears localStorage → onboarding pops up again.
--
-- A single jsonb column on users holds the whole bag so we can add
-- new flags without a schema migration each time. Shape:
--   {
--     "guidedSeen": true,
--     "checklistDismissed": true,
--     "checklistExpanded": false,
--     "sidebarSeenAt": "2026-04-21T..."
--   }
--
-- Future Wave 6 will consolidate the three UIs into one server-driven
-- component; this column is the data substrate for that.

alter table public.users
  add column if not exists onboarding_state jsonb default '{}'::jsonb not null;
