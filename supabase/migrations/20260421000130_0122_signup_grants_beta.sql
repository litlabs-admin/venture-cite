-- Source: migrations/0122_signup_grants_beta.sql
-- SHA256: 862219f328212e0eebcceab5eb01831e063ab8438e343fcf8dbe963163aa6867

-- New signups get beta access, not a paywall.
--
-- handle_new_user stamped access_tier = 'pending', which is the ZERO-
-- entitlement tier (usageLimits.pending = 0 brands, 0 articles). Two gates key
-- off it and both fire for every new account:
--
--   TrialGate.tsx:133   `resolveTier(user) !== "pending"` is what lets anyone
--                       past the plan wall, so a new signup saw pricing.
--   routeGates.tsx:157  sends a brandless user to /welcome only when their
--                       tier allows a brand at all; on 0 it sends them to
--                       /pricing instead.
--
-- So the paywall was not a separate feature to remove - it was this one
-- column value. Granting 'beta' at signup satisfies both gates, and the
-- existing routing then does exactly what we want with no client change:
-- brandless user -> /welcome -> the activation pipeline.
--
-- 'beta' is an established tier here, not a new one: usageLimits.beta already
-- grants 3 brands and 20 articles/month, and beta is already in PAYING_TIERS,
-- so trial/upgrade copy treats these users as having a plan rather than
-- offering them a second trial.
--
-- SCOPE: the INSERT only. The ON CONFLICT branch still does not touch
-- access_tier, for the reason its own comment gives - that branch also fires
-- on re-confirmation and on the email-reclaim path, where rewriting the tier
-- would downgrade a paying customer. Existing accounts are untouched by this
-- migration; only rows created after it runs are affected.
--
-- To go back to a paywalled signup, replace 'beta' with 'pending' here.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    'beta',
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

-- Migration 0111 revoked EXECUTE after replacing this function; CREATE OR
-- REPLACE re-grants the owner default, so re-apply the same lockdown here.
-- Without it, replacing the function silently widens who may call a
-- SECURITY DEFINER routine.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
