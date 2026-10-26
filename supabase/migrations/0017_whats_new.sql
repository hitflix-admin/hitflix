-- "What's new" popups: which update announcements (src/whatsNew.js) each
-- account has already seen, so each one shows once per account, on
-- whichever device gets to it first. The updates themselves live in the
-- app; this only remembers what's been shown.
--
-- since: updates published before this aren't shown at all. Accounts
-- created from now on get a row with since = sign-up time, so a newcomer
-- isn't greeted with old news — only updates released after they joined.
-- Accounts that already existed have no row (since = null), so they see
-- every update they haven't seen yet.

create table public.whats_new_seen (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  seen text[] not null default '{}' check (cardinality(seen) <= 200),
  since timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.whats_new_seen enable row level security;

create policy "Users can read their own what's new state"
  on public.whats_new_seen for select
  to authenticated
  using (auth.uid() = user_id);

-- all writes go through mark_whats_new_seen
grant select on public.whats_new_seen to authenticated;

-- Adds update ids to the caller's seen list (creating the row the first
-- time). Merges rather than replaces, so two devices both stick.
create function public.mark_whats_new_seen(update_ids text[])
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if cardinality(update_ids) > 200
    or exists (select 1 from unnest(update_ids) id where id !~ '^[a-z0-9-]{1,60}$')
  then
    raise exception 'bad update ids';
  end if;
  insert into public.whats_new_seen (user_id, seen)
  values (auth.uid(), coalesce((select array_agg(distinct id order by id) from unnest(update_ids) id), '{}'))
  on conflict (user_id) do update
    set seen = (
          select coalesce(array_agg(distinct id order by id), '{}')
          from unnest(public.whats_new_seen.seen || excluded.seen) id
        ),
        updated_at = now();
end;
$$;

create function public.create_whats_new_row()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.whats_new_seen (user_id, since) values (new.id, now()) on conflict do nothing;
  return new;
end;
$$;

-- profiles rows are created for every new account (handle_new_user, 0001)
create trigger profiles_create_whats_new
  after insert on public.profiles
  for each row execute function public.create_whats_new_row();

revoke execute on function public.create_whats_new_row() from public, anon, authenticated;
revoke execute on function public.mark_whats_new_seen(text[]) from public, anon;
grant execute on function public.mark_whats_new_seen(text[]) to authenticated;
