-- Hotfix for a regression introduced by 0074.
--
-- public.users.id is `varchar`; auth.users.id (new.id) is `uuid`. The
-- 0074 reclaim added `... and id <> new.id`, i.e. `varchar <> uuid`,
-- for which Postgres has no operator (SQLSTATE 42883 "operator does not
-- exist: character varying <> uuid"). The trigger therefore raised on
-- EVERY auth.users insert, and GoTrue surfaced it as the generic
-- "Database error creating new user" — so 0074 broke registration for
-- all new users, not just the originally-reported email.
--
-- The original 0001 function never compared id (it only *assigned*
-- new.id into the varchar column, which is a valid implicit cast), so
-- it was unaffected. Fix: cast new.id to text for the comparison.
-- Everything else is identical to 0074. Idempotent; safe to re-run.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Reclaim a stale email left by a previously-deleted auth user so the
  -- UNIQUE(email) constraint can't abort the auth.users insert. The
  -- id cast is required: public.users.id is varchar, new.id is uuid.
  delete from public.users
  where email = new.email
    and id <> new.id::text;

  insert into public.users (
    id, email, first_name, last_name, email_verified, created_at, updated_at
  ) values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'firstName',
    new.raw_user_meta_data->>'lastName',
    case when new.email_confirmed_at is not null then 1 else 0 end,
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = coalesce(excluded.first_name, public.users.first_name),
    last_name = coalesce(excluded.last_name, public.users.last_name),
    email_verified = excluded.email_verified,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_user();
