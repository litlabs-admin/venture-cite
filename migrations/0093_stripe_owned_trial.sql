-- Stripe owns the trial. Signup no longer grants one.
--
-- Migration 0092 stamped access_tier='trial' + trial_ends_at at signup, for an
-- app-managed 14-day trial with no card. That model is replaced: a card is now
-- collected before the app opens, the subscription carries Stripe's own
-- trial_period_days, and Stripe bills on day 15. Two sources of truth for the
-- same 14 days could only ever disagree with the system taking the money.
--
-- New accounts therefore start at 'pending' - registered, no plan chosen - and
-- the app is gated until they pick one.

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
    access_tier,
    created_at, updated_at
  ) values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'firstName',
    new.raw_user_meta_data->>'lastName',
    case when new.email_confirmed_at is not null then 1 else 0 end,
    'pending',
    now(),
    now()
  )
  -- Still does not touch access_tier: this branch fires on re-confirmation and
  -- on the email-reclaim path above, where resetting the tier would downgrade
  -- a paying customer to 'pending' and lock them out of the app.
  on conflict (id) do update set
    email = excluded.email,
    first_name = coalesce(excluded.first_name, public.users.first_name),
    last_name = coalesce(excluded.last_name, public.users.last_name),
    email_verified = excluded.email_verified,
    updated_at = now();
  return new;
end;
$function$;

-- Anyone stamped 'trial' by 0092 never provided a card, so there is no Stripe
-- subscription behind them - they belong in 'pending' with everyone else who
-- has yet to choose a plan.
UPDATE users
SET access_tier = 'pending', trial_ends_at = NULL
WHERE access_tier = 'trial';

-- 'expired' meant zero access. The terminal state is now 'readonly': same zero
-- entitlements, but the app renders their data instead of a wall.
UPDATE users
SET access_tier = 'readonly'
WHERE access_tier = 'expired';

-- The 30 legacy 'free' and 6 'agency' accounts are untouched.
