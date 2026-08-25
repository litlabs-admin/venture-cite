-- Server-side onboarding state.
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
-- This column keeps the state for the current onboarding interfaces.

alter table public.users
  add column if not exists onboarding_state jsonb default '{}'::jsonb not null;
