-- Phase 4 step 2: collaborative lists.
--
-- Any member can add, remove, reorder, and rename; "deleting" a list leaves
-- it, and the list is deleted once its last member leaves (0003). People join
-- through an invite from a friend who's a member (they must accept) or
-- through the list's join link.
--
-- Saving switches from replacing a list's whole entry set (sync_list_entries)
-- to one small change at a time — add one entry, remove one, move one — so
-- people editing at the same time don't undo each other's changes. Positions
-- become fractional: a move only rewrites the moved entry's position.
--
-- Live updates: any change to a list sends a "lists changed" broadcast to each
-- member's private Realtime topic (user:<id>); the app then reloads its lists.
--
-- Ratings are untouched: reviews stay readable only by their author.

-- ---------------------------------------------------------------- positions
alter table public.list_entries drop constraint if exists list_entries_position_check;
alter table public.list_entries alter column position type double precision;

-- ---------------------------------------------------------------- member cap
-- At most 20 people per list. Locks the list row so two joins at once can't
-- both squeeze past the limit.
create function public.enforce_list_member_cap()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform 1 from public.lists where id = new.list_id for update;
  if (select count(*) from public.list_members where list_id = new.list_id) >= 20 then
    raise exception 'this list already has 20 members';
  end if;
  return new;
end;
$$;

create trigger list_members_cap
  before insert on public.list_members
  for each row execute function public.enforce_list_member_cap();

-- ---------------------------------------------------------------- change ops
-- All security definer with an explicit membership check, so each can lock
-- the list row: changes to one list then run one at a time, which keeps the
-- size cap and the top/bottom positions consistent.

-- Adds one movie. at_top puts it first in its section, otherwise last.
-- Returns false (and changes nothing) if the movie is already on the list —
-- e.g. two people added it at once — or this entry was already saved.
create function public.add_list_entry(
  entry_id uuid,
  target_list uuid,
  movie jsonb,
  entry_section text default 'main',
  at_top boolean default false
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  cap integer;
  new_position double precision;
  inserted integer;
begin
  if not public.is_list_member(target_list) then
    raise exception 'not a member of this list';
  end if;
  if entry_section not in ('main', 'honorable') then
    raise exception 'bad section';
  end if;
  select target_length into cap from public.lists where id = target_list for update;

  if entry_section = 'main' and cap > 0
    and (select count(*) from public.list_entries where list_id = target_list and section = 'main') >= cap
  then
    raise exception 'this list is full';
  end if;

  perform public.ensure_movies(jsonb_build_array(movie));

  if at_top then
    select coalesce(min(position) - 1, 0) into new_position
    from public.list_entries where list_id = target_list and section = entry_section;
  else
    select coalesce(max(position) + 1, 0) into new_position
    from public.list_entries where list_id = target_list and section = entry_section;
  end if;

  insert into public.list_entries (id, list_id, movie_id, section, position, added_by)
  values (entry_id, target_list, movie->>'id', entry_section, new_position, auth.uid())
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted > 0;
end;
$$;

-- Removes one entry. Already gone is fine.
create function public.remove_list_entry(entry_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  target_list uuid;
begin
  select list_id into target_list from public.list_entries where id = entry_id;
  if target_list is null then
    return;
  end if;
  if not public.is_list_member(target_list) then
    raise exception 'not a member of this list';
  end if;
  delete from public.list_entries where id = entry_id;
end;
$$;

-- Moves one entry within its section to just below after_id (null = the top).
-- If after_id has been removed meanwhile, it goes just above before_id
-- instead; if both are gone, to the end. Only the moved entry's position
-- changes, unless the gap has worn too thin, in which case the section is
-- renumbered first.
create function public.move_list_entry(entry_id uuid, after_id uuid, before_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  moving public.list_entries;
  anchor public.list_entries;
  lo double precision;
  hi double precision;
  attempt integer;
begin
  select * into moving from public.list_entries where id = entry_id;
  if not found then
    return;
  end if;
  if not public.is_list_member(moving.list_id) then
    raise exception 'not a member of this list';
  end if;
  perform 1 from public.lists where id = moving.list_id for update;

  for attempt in 1..2 loop
    lo := null;
    hi := null;
    if after_id is null then
      -- to the top
      select min(position) into hi from public.list_entries
      where list_id = moving.list_id and section = moving.section and id <> entry_id;
      lo := hi - 2;
    else
      select * into anchor from public.list_entries
      where id = after_id and list_id = moving.list_id and section = moving.section and id <> entry_id;
      if found then
        lo := anchor.position;
        select min(position) into hi from public.list_entries
        where list_id = moving.list_id and section = moving.section and id <> entry_id and position > lo;
        hi := coalesce(hi, lo + 2);
      else
        select * into anchor from public.list_entries
        where id = before_id and list_id = moving.list_id and section = moving.section and id <> entry_id;
        if found then
          hi := anchor.position;
          select max(position) into lo from public.list_entries
          where list_id = moving.list_id and section = moving.section and id <> entry_id and position < hi;
          lo := coalesce(lo, hi - 2);
        else
          -- both neighbours gone: to the end
          select max(position) into lo from public.list_entries
          where list_id = moving.list_id and section = moving.section and id <> entry_id;
          hi := lo + 2;
        end if;
      end if;
    end if;

    if lo is null then
      return; -- the only entry in its section
    end if;
    if hi - lo > 1e-9 then
      update public.list_entries set position = (lo + hi) / 2 where id = entry_id;
      return;
    end if;

    -- out of room between the two neighbours: space the section out evenly
    -- (keeping the current order) and try again
    update public.list_entries le set position = r.n
    from (
      select id, row_number() over (order by position, id) as n
      from public.list_entries
      where list_id = moving.list_id and section = moving.section
    ) r
    where le.id = r.id;
  end loop;
end;
$$;

-- Saving the whole entry set from one browser would undo other members'
-- edits, so it's now only allowed while the list has a single member (it's
-- still used to fill in lists imported from signed-out browser storage).
create or replace function public.sync_list_entries(target_list uuid, entries jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_list_member(target_list) then
    raise exception 'not a member of this list';
  end if;
  if (select count(*) from public.list_members where list_id = target_list) > 1 then
    raise exception 'shared lists are saved one change at a time';
  end if;

  perform public.ensure_movies(
    coalesce((select jsonb_agg(e->'movie') from jsonb_array_elements(entries) e), '[]'::jsonb)
  );

  delete from public.list_entries le
  where le.list_id = target_list
    and le.id not in (select (e->>'id')::uuid from jsonb_array_elements(entries) e);

  insert into public.list_entries (id, list_id, movie_id, section, position)
  select (e->>'id')::uuid, target_list, e->'movie'->>'id', e->>'section', (e->>'position')::double precision
  from jsonb_array_elements(entries) e
  on conflict (id) do update
    set section = excluded.section, position = excluded.position
    where public.list_entries.list_id = excluded.list_id;
end;
$$;

-- ---------------------------------------------------------------- people on my lists
-- For each of my lists: its members, plus anyone who added an entry and has
-- since left (so "added by" still has a name). Usernames are already public.
create function public.my_list_people()
returns table (list_id uuid, user_id uuid, username text, is_member boolean, joined_at timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select m.list_id, m.user_id, p.username, true, m.joined_at
  from public.list_members mine
  join public.list_members m on m.list_id = mine.list_id
  join public.profiles p on p.id = m.user_id
  where mine.user_id = auth.uid()
  union
  select distinct e.list_id, e.added_by, p.username, false, null::timestamptz
  from public.list_members mine
  join public.list_entries e on e.list_id = mine.list_id
  join public.profiles p on p.id = e.added_by
  where mine.user_id = auth.uid()
    and not exists (
      select 1 from public.list_members m where m.list_id = e.list_id and m.user_id = e.added_by
    );
$$;

-- ---------------------------------------------------------------- friend invites
create table public.list_invites (
  list_id uuid not null references public.lists (id) on delete cascade,
  invitee uuid not null references auth.users (id) on delete cascade,
  inviter uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (list_id, invitee)
);

create index list_invites_invitee_idx on public.list_invites (invitee);

alter table public.list_invites enable row level security;

create policy "Invitees and list members can see invites"
  on public.list_invites for select
  to authenticated
  using (invitee = auth.uid() or public.is_list_member(list_id));

-- all changes go through the functions below
grant select on public.list_invites to authenticated;

-- Invites a friend to a list you're on. Returns 'invited', or 'member' if
-- they're already on it.
create function public.invite_to_list(target_list uuid, friend uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_list_member(target_list) then
    raise exception 'not a member of this list';
  end if;
  if not public.are_friends(auth.uid(), friend) then
    raise exception 'you can only invite friends';
  end if;
  if exists (select 1 from public.list_members where list_id = target_list and user_id = friend) then
    return 'member';
  end if;
  insert into public.list_invites (list_id, invitee, inviter)
  values (target_list, friend, auth.uid())
  on conflict do nothing;
  return 'invited';
end;
$$;

-- Takes back an invite to a list you're on.
create function public.cancel_list_invite(target_list uuid, friend uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_list_member(target_list) then
    raise exception 'not a member of this list';
  end if;
  delete from public.list_invites where list_id = target_list and invitee = friend;
end;
$$;

-- Accepts (joins the list) or declines an invite you received.
create function public.respond_list_invite(target_list uuid, accept boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if not exists (select 1 from public.list_invites where list_id = target_list and invitee = auth.uid()) then
    raise exception 'that invite is no longer open';
  end if;
  if accept then
    insert into public.list_members (list_id, user_id) values (target_list, auth.uid())
    on conflict do nothing;
  end if;
  delete from public.list_invites where list_id = target_list and invitee = auth.uid();
end;
$$;

-- Invites you've received, with the list's name and who sent it.
create function public.my_list_invites()
returns table (
  list_id uuid,
  list_name text,
  inviter_username text,
  member_count bigint,
  entry_count bigint,
  created_at timestamptz
)
language sql
stable
security definer set search_path = ''
as $$
  select i.list_id, l.name, p.username,
    (select count(*) from public.list_members m where m.list_id = i.list_id),
    (select count(*) from public.list_entries e where e.list_id = i.list_id and e.section = 'main'),
    i.created_at
  from public.list_invites i
  join public.lists l on l.id = i.list_id
  left join public.profiles p on p.id = i.inviter
  where i.invitee = auth.uid()
  order by i.created_at desc;
$$;

-- ---------------------------------------------------------------- join links
-- One link per list. It never expires; any member can copy it, reset it (the
-- old link stops working), or turn it off. Anyone signed in who opens it can
-- join as a full member.
create table public.list_join_links (
  list_id uuid primary key references public.lists (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{32}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.list_join_links enable row level security;

create policy "Members can see their lists' join links"
  on public.list_join_links for select
  to authenticated
  using (public.is_list_member(list_id));

grant select on public.list_join_links to authenticated;

-- Returns the list's join token, making one if it has none. reset = true
-- replaces the token, so the old link stops working.
create function public.get_join_link(target_list uuid, reset boolean default false)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  existing text;
  fresh text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_list_member(target_list) then
    raise exception 'not a member of this list';
  end if;
  select token into existing from public.list_join_links where list_id = target_list;
  if existing is not null and not reset then
    return existing;
  end if;
  insert into public.list_join_links (list_id, token, created_by)
  values (target_list, fresh, auth.uid())
  on conflict (list_id) do update
    set token = excluded.token, created_by = excluded.created_by, created_at = now();
  return fresh;
end;
$$;

create function public.disable_join_link(target_list uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_list_member(target_list) then
    raise exception 'not a member of this list';
  end if;
  delete from public.list_join_links where list_id = target_list;
end;
$$;

-- What a join link points at, for the "Join this list?" prompt. No rows if
-- the link was reset or turned off.
create function public.join_link_info(link_token text)
returns table (list_id uuid, list_name text, member_count bigint, entry_count bigint, already_member boolean)
language sql
stable
security definer set search_path = ''
as $$
  select l.id, l.name,
    (select count(*) from public.list_members m where m.list_id = l.id),
    (select count(*) from public.list_entries e where e.list_id = l.id and e.section = 'main'),
    exists (select 1 from public.list_members m where m.list_id = l.id and m.user_id = auth.uid())
  from public.list_join_links j
  join public.lists l on l.id = j.list_id
  where auth.uid() is not null and j.token = link_token;
$$;

-- Joins the list a link points at. Returns the list's id.
create function public.join_list_by_link(link_token text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  target_list uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  select list_id into target_list from public.list_join_links where token = link_token;
  if target_list is null then
    raise exception 'this link no longer works';
  end if;
  insert into public.list_members (list_id, user_id) values (target_list, auth.uid())
  on conflict do nothing;
  delete from public.list_invites where list_id = target_list and invitee = auth.uid();
  return target_list;
end;
$$;

-- ---------------------------------------------------------------- realtime
-- Each signed-in user listens on a private topic, user:<their id>. A message
-- only says "something changed" — the app reloads through the normal,
-- RLS-checked queries — so no list contents travel over Realtime.
create function public.notify_user(target uuid, kind text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('kind', kind), 'changed', 'user:' || target::text, true);
end;
$$;

create function public.notify_list_members(target_list uuid)
returns void
language sql
security definer set search_path = ''
as $$
  select public.notify_user(m.user_id, 'lists')
  from public.list_members m
  where m.list_id = target_list;
$$;

-- every entry change already touches lists.updated_at (0003), so this one
-- trigger covers renames, settings, and add/remove/move
create function public.lists_broadcast_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.notify_list_members(new.id);
  return null;
end;
$$;

create trigger lists_broadcast
  after update on public.lists
  for each row execute function public.lists_broadcast_change();

create function public.list_members_broadcast_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  changed public.list_members := coalesce(new, old);
begin
  -- the person joining or leaving (their other devices), then everyone still on it
  perform public.notify_user(changed.user_id, 'lists');
  perform public.notify_list_members(changed.list_id);
  return null;
end;
$$;

create trigger list_members_broadcast
  after insert or delete on public.list_members
  for each row execute function public.list_members_broadcast_change();

create function public.list_invites_broadcast_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.notify_user((coalesce(new, old)).invitee, 'invites');
  return null;
end;
$$;

create trigger list_invites_broadcast
  after insert or delete on public.list_invites
  for each row execute function public.list_invites_broadcast_change();

create policy "Users can listen on their own topic"
  on realtime.messages for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'user:' || auth.uid()::text
  );

-- ---------------------------------------------------------------- grants
revoke execute on function public.enforce_list_member_cap() from public, anon, authenticated;
revoke execute on function public.lists_broadcast_change() from public, anon, authenticated;
revoke execute on function public.list_members_broadcast_change() from public, anon, authenticated;
revoke execute on function public.list_invites_broadcast_change() from public, anon, authenticated;
revoke execute on function public.notify_user(uuid, text) from public, anon, authenticated;
revoke execute on function public.notify_list_members(uuid) from public, anon, authenticated;

revoke execute on function public.add_list_entry(uuid, uuid, jsonb, text, boolean) from public, anon;
revoke execute on function public.remove_list_entry(uuid) from public, anon;
revoke execute on function public.move_list_entry(uuid, uuid, uuid) from public, anon;
revoke execute on function public.my_list_people() from public, anon;
revoke execute on function public.invite_to_list(uuid, uuid) from public, anon;
revoke execute on function public.cancel_list_invite(uuid, uuid) from public, anon;
revoke execute on function public.respond_list_invite(uuid, boolean) from public, anon;
revoke execute on function public.my_list_invites() from public, anon;
revoke execute on function public.get_join_link(uuid, boolean) from public, anon;
revoke execute on function public.disable_join_link(uuid) from public, anon;
revoke execute on function public.join_link_info(text) from public, anon;
revoke execute on function public.join_list_by_link(text) from public, anon;

grant execute on function public.add_list_entry(uuid, uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.remove_list_entry(uuid) to authenticated;
grant execute on function public.move_list_entry(uuid, uuid, uuid) to authenticated;
grant execute on function public.my_list_people() to authenticated;
grant execute on function public.invite_to_list(uuid, uuid) to authenticated;
grant execute on function public.cancel_list_invite(uuid, uuid) to authenticated;
grant execute on function public.respond_list_invite(uuid, boolean) to authenticated;
grant execute on function public.my_list_invites() to authenticated;
grant execute on function public.get_join_link(uuid, boolean) to authenticated;
grant execute on function public.disable_join_link(uuid) to authenticated;
grant execute on function public.join_link_info(text) to authenticated;
grant execute on function public.join_list_by_link(text) to authenticated;
