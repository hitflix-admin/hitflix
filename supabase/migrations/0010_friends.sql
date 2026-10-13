-- Friends and profile search.
--
-- Friendships are mutual: one person sends a request, the other accepts.
-- Friends can see each other's profile card, game results (stats/awards),
-- and active days (streak). Reviews/ratings stay private to everyone.
-- Non-friends only ever see what profiles already exposes: username,
-- member number, and when the profile was created.

create table public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- one row per pair, whichever direction the request went
create unique index friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee_idx on public.friendships (addressee);

alter table public.friendships enable row level security;

create policy "People can see their own friendships and requests"
  on public.friendships for select
  to authenticated
  using (auth.uid() in (requester, addressee));

-- all changes go through the functions below
grant select on public.friendships to authenticated;

create function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester, f.addressee) = least(a, b)
      and greatest(f.requester, f.addressee) = greatest(a, b)
  );
$$;

-- Sends a request — or, if they already sent you one, accepts it.
-- Returns the resulting relation: 'sent' or 'friends'.
create function public.send_friend_request(target uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  existing public.friendships;
begin
  if me is null then
    raise exception 'must be signed in';
  end if;
  if target = me then
    raise exception 'cannot friend yourself';
  end if;
  if not exists (select 1 from public.profiles where id = target and username is not null) then
    raise exception 'no such user';
  end if;
  select * into existing from public.friendships f
  where least(f.requester, f.addressee) = least(me, target)
    and greatest(f.requester, f.addressee) = greatest(me, target);
  if found then
    if existing.status = 'accepted' then
      return 'friends';
    elsif existing.requester = target then
      update public.friendships set status = 'accepted', accepted_at = now()
      where requester = target and addressee = me;
      return 'friends';
    else
      return 'sent';
    end if;
  end if;
  insert into public.friendships (requester, addressee) values (me, target);
  return 'sent';
end;
$$;

-- Accepts or declines a request someone sent you.
create function public.respond_friend_request(requester_id uuid, accept boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if accept then
    update public.friendships set status = 'accepted', accepted_at = now()
    where requester = requester_id and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships
    where requester = requester_id and addressee = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Unfriends, or cancels a request you sent (either direction, any status).
create function public.remove_friend(other uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  delete from public.friendships f
  where least(f.requester, f.addressee) = least(auth.uid(), other)
    and greatest(f.requester, f.addressee) = greatest(auth.uid(), other);
end;
$$;

-- Friends, incoming requests, and sent requests, with each person's profile.
create function public.list_friends()
returns table (
  id uuid,
  username text,
  member_number bigint,
  created_at timestamptz,
  relation text
)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, p.username, p.member_number, p.created_at,
    case
      when f.status = 'accepted' then 'friends'
      when f.requester = auth.uid() then 'sent'
      else 'received'
    end
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by lower(p.username);
$$;

-- Username prefix search (case-insensitive), with how each result relates
-- to the caller. Exact matches first, then shorter names.
create function public.search_profiles(query text)
returns table (
  id uuid,
  username text,
  member_number bigint,
  created_at timestamptz,
  relation text
)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, p.username, p.member_number, p.created_at,
    case
      when p.id = auth.uid() then 'self'
      when f.status = 'accepted' then 'friends'
      when f.requester = auth.uid() then 'sent'
      when f.addressee = auth.uid() then 'received'
      else 'none'
    end
  from public.profiles p
  left join public.friendships f
    on least(f.requester, f.addressee) = least(p.id, auth.uid())
   and greatest(f.requester, f.addressee) = greatest(p.id, auth.uid())
  where auth.uid() is not null
    and p.username is not null
    and length(trim(query)) > 0
    -- escape LIKE wildcards so "_" in a search means a literal underscore
    and lower(p.username) like
      replace(replace(replace(lower(trim(query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by lower(p.username) = lower(trim(query)) desc, length(p.username), lower(p.username)
  limit 10;
$$;

revoke execute on function public.are_friends(uuid, uuid) from public, anon;
revoke execute on function public.send_friend_request(uuid) from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
revoke execute on function public.list_friends() from public, anon;
revoke execute on function public.search_profiles(text) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.search_profiles(text) to authenticated;

-- ---------------------------------------------------------------- friend visibility
-- Cards, game results, and active days: readable by the owner and their friends.

drop policy "Users can read their own card" on public.profile_cards;
create policy "Owners and friends can read cards"
  on public.profile_cards for select
  to authenticated
  using (auth.uid() = user_id or public.are_friends(auth.uid(), user_id));

drop policy "Users can read their own game results" on public.game_results;
create policy "Owners and friends can read game results"
  on public.game_results for select
  to authenticated
  using (auth.uid() = user_id or public.are_friends(auth.uid(), user_id));

drop policy "Users can read their own active days" on public.activity_days;
create policy "Owners and friends can read active days"
  on public.activity_days for select
  to authenticated
  using (auth.uid() = user_id or public.are_friends(auth.uid(), user_id));
