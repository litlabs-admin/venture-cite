-- Fix: registration fails with "Database error creating new user"
-- (Supabase AuthApiError code=unexpected_failure).
--
-- Root cause: there is no auth.users DELETE → public.users cleanup, so
-- deleting a Supabase auth user leaves an orphaned public.users row.
-- public.users.email is UNIQUE. When that email is registered again,
-- Supabase creates a fresh auth.users row with a NEW id; the
-- on_auth_user_created trigger then does
--   INSERT INTO public.users (id, email, ...) ON CONFLICT (id) ...
-- The ON CONFLICT target is `id`, so the brand-new id does NOT conflict,
-- but the reused `email` violates the UNIQUE constraint. The exception
-- propagates out of the AFTER INSERT trigger and aborts the auth.users
-- insert, which GoTrue surfaces as "Database error creating new user".
--
-- Safety invariant for the reclaim DELETE below: Supabase enforces
-- uniqueness of auth.users.email. This trigger only fires AFTER GoTrue
-- has already inserted NEW into auth.users, which means no other live
-- auth user holds NEW.email. Therefore any public.users row with
-- NEW.email and a different id has no backing auth user — it is
-- definitively orphaned (its account is unreachable; it cannot log in).
-- Deleting it only ever removes dead data, never an active account, and
-- is the same outcome the soft-delete purge cron would eventually reach.
-- Child rows cascade per the FK ON DELETE rules (migration 0003).
--
-- migrationRunner tracks applied files in schema_migrations and skips
-- already-applied ones, so 0001_auth_sync.sql does NOT re-run on boot;
-- this new file supersedes its function via CREATE OR REPLACE.
-- Idempotent: safe to re-run.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Reclaim a stale email left by a previously-deleted auth user so the
  -- UNIQUE(email) constraint can't abort the auth.users insert. See the
  -- safety invariant in this migration's header — this only ever deletes
  -- orphaned rows (no live auth user can hold NEW.email at this point).
  delete from public.users
  where email = new.email
    and id <> new.id;

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

-- Re-assert the trigger (idempotent; matches 0001's pattern) so this
-- migration is self-contained even if the trigger was ever dropped.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_user();
