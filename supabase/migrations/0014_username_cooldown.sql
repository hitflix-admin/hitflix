-- Usernames can be changed at most once every 7 days.
--
-- Picking a username for the first time (it starts out null at sign-up)
-- doesn't start the clock, so a new player can still fix a typo right away;
-- every change after that does. Changes made without a signed-in user — the
-- SQL Editor, i.e. the site admin — skip the check and don't start the clock;
-- to lift someone's cooldown early:
--   update public.profiles set username_changed_at = null where username = '...';

alter table public.profiles add column username_changed_at timestamptz;

create function public.enforce_username_cooldown()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- the SQL Editor (no signed-in user): no limit, and the admin can set
  -- username_changed_at directly, e.g. to null to lift someone's cooldown
  if auth.uid() is null then
    return new;
  end if;
  if new.username is not distinct from old.username then
    -- for signed-in users, only this trigger sets the timestamp
    new.username_changed_at := old.username_changed_at;
    return new;
  end if;
  if old.username is not null then
    if old.username_changed_at > now() - interval '7 days' then
      -- details: when the next change is allowed, for the app's message
      raise exception using
        message = 'username_cooldown',
        detail = to_char((old.username_changed_at + interval '7 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_username_cooldown
  before update on public.profiles
  for each row execute function public.enforce_username_cooldown();

revoke execute on function public.enforce_username_cooldown() from public, anon, authenticated;
