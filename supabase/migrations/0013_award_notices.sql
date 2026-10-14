-- Which awards each account has already been shown an "award unlocked"
-- popup for, so every award pops up once per account, on whichever device
-- notices it first. Awards themselves are still worked out in the app from
-- game_results and activity_days (src/gameStats.js); this only remembers
-- what's been announced.
--
-- A row's existence also means "set up". Accounts created from now on get
-- an empty row straight away, so every award they earn pops up — including
-- ones from games played before signing up. Accounts that already existed
-- have no row yet: the first time the app checks one, every award it has
-- already earned is recorded here without a popup, so popups start with
-- the next award earned.

create table public.award_notices (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  seen text[] not null default '{}' check (cardinality(seen) <= 100),
  updated_at timestamptz not null default now()
);

alter table public.award_notices enable row level security;

create policy "Users can read their own award notices"
  on public.award_notices for select
  to authenticated
  using (auth.uid() = user_id);

-- all writes go through mark_awards_seen
grant select on public.award_notices to authenticated;

-- Adds award ids to the caller's seen list (creating the row the first
-- time). Merges rather than replaces, so two devices marking different
-- awards at once both stick.
create function public.mark_awards_seen(award_ids text[])
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if cardinality(award_ids) > 100
    or exists (select 1 from unnest(award_ids) id where id !~ '^[a-z0-9-]{1,40}$')
  then
    raise exception 'bad award ids';
  end if;
  insert into public.award_notices (user_id, seen)
  values (auth.uid(), coalesce((select array_agg(distinct id order by id) from unnest(award_ids) id), '{}'))
  on conflict (user_id) do update
    set seen = (
          select coalesce(array_agg(distinct id order by id), '{}')
          from unnest(public.award_notices.seen || excluded.seen) id
        ),
        updated_at = now();
end;
$$;

create function public.create_award_notices_row()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.award_notices (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

-- profiles rows are created for every new account (handle_new_user, 0001)
create trigger profiles_create_award_notices
  after insert on public.profiles
  for each row execute function public.create_award_notices_row();

revoke execute on function public.create_award_notices_row() from public, anon, authenticated;
revoke execute on function public.mark_awards_seen(text[]) from public, anon;
grant execute on function public.mark_awards_seen(text[]) to authenticated;
