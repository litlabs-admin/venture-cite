-- Source: migrations/0092_signup_grants_trial.sql
-- SHA256: 8b409d3b506ed7a10b1792b7bf5c451dd0165804925f4e21ab1ff41b98c31884

-- Grant the 14-day trial at signup. Without this, nobody ever gets one.
--
-- THE BUG: the trial was implemented in DatabaseStorage.createUser(), which
-- has zero callers. Real signups never touch it - Supabase Auth creates the
-- auth.users row and THIS trigger creates the public.users row. The previous
-- definition inserted only identity columns, so access_tier fell back to its
-- column default 'free' and trial_ends_at stayed NULL.
--
-- The effect: resolveTier() saw a non-trial tier and returned "free"
-- (1 brand, 5 articles) permanently. No countdown, no paywall, no reason to
-- ever pay. The entire trial funnel was inert for every account ever created.
--
-- Fixing it HERE rather than in application code is deliberate: OAuth,
-- magic-link and any future Supabase-native signup path never execute
-- server/auth.ts either. The trigger is the one place every account is born.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Reclaim a stale email left by a previously-deleted auth user so the
  -- UNIQUE(email) constraint can't abort the auth.users insert. The
  -- id cast is required: public.users.id is varchar, new.id is uuid.
  delete from public.users
  where email = new.email
    and id <> new.id::text;

  insert into public.users (
    id, email, first_name, last_name, email_verified,
    access_tier, trial_ends_at,
    created_at, updated_at
  ) values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'firstName',
    new.raw_user_meta_data->>'lastName',
    case when new.email_confirmed_at is not null then 1 else 0 end,
    'trial',
    now() + interval '14 days',
    now(),
    now()
  )
  -- The conflict branch deliberately does NOT touch access_tier or
  -- trial_ends_at. This fires on re-confirmation and on the email-reclaim
  -- path above; re-stamping the trial there would hand a fresh 14 days to
  -- anyone who triggers it, and would downgrade a PAYING customer to 'trial'.
  on conflict (id) do update set
    email = excluded.email,
    first_name = coalesce(excluded.first_name, public.users.first_name),
    last_name = coalesce(excluded.last_name, public.users.last_name),
    email_verified = excluded.email_verified,
    updated_at = now();
  return new;
end;
$function$;

-- Existing accounts are untouched. The 30 legacy 'free' accounts keep their
-- tier and the 6 'agency' accounts keep theirs - backfilling a trial onto
-- either would be a downgrade, not a gift.
