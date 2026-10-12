-- Phase 2: movies, reviews, and lists.
-- Lists belong to their members (list_members), not to one owner: every
-- member can rename and edit a list, "deleting" a list only removes you from
-- it, and the list itself is deleted once its last member leaves. Until
-- sharing lands (Phase 4) every list just has one member, its creator.

-- ---------------------------------------------------------------- movies
-- A shared cache of Wikipedia film metadata, keyed by Wikipedia pageid (the
-- same id the app already uses). Filled in by whoever first adds or rates a
-- film. Insert-only from the client so one user can't rewrite a movie's
-- title/poster for everyone; corrections go through the dashboard.
create table public.movies (
  id text primary key check (id ~ '^[0-9]+$'),
  title text not null check (char_length(title) between 1 and 300),
  page_title text not null check (char_length(page_title) between 1 and 300),
  year smallint check (year between 1870 and 2100),
  poster_url text check (poster_url ~ '^https://upload\.wikimedia\.org/'),
  page_url text check (page_url ~ '^https://en\.wikipedia\.org/'),
  description text check (char_length(description) <= 500),
  extract text check (char_length(extract) <= 5000),
  created_at timestamptz not null default now()
);

alter table public.movies enable row level security;

create policy "Movies are publicly readable"
  on public.movies for select
  using (true);

create policy "Signed-in users can add movies"
  on public.movies for insert
  to authenticated
  with check (true);

grant select on public.movies to anon, authenticated;
grant insert on public.movies to authenticated;

-- ---------------------------------------------------------------- reviews
-- One rating per user per movie, shared across all of that user's lists
-- (same as the app's existing movieReviews map).
create table public.reviews (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  movie_id text not null references public.movies (id),
  overall smallint not null check (overall between 0 and 10),
  writing smallint not null check (writing between 1 and 5),
  performance smallint not null check (performance between 1 and 5),
  visuals smallint not null check (visuals between 1 and 5),
  audio smallint not null check (audio between 1 and 5),
  -- same formula as calcScore in src/movieUI.jsx: 0–100
  score smallint generated always as (
    round(((writing + performance + visuals + audio) * 5 + overall * 10) / 2.0)::smallint
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

create index reviews_movie_id_idx on public.reviews (movie_id);

alter table public.reviews enable row level security;

-- Individual ratings are private to their author — never shown to other
-- users, collaborators included. The Hitflix score (Phase 5) will expose
-- aggregates only, and leave out suspended accounts; deleting an account
-- deletes its reviews (cascade above), so they drop out of the score too.
create policy "Users can read their own reviews"
  on public.reviews for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can add their own reviews"
  on public.reviews for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own reviews"
  on public.reviews for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own reviews"
  on public.reviews for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.reviews to authenticated;
grant update (overall, writing, performance, visuals, audio) on public.reviews to authenticated;

-- ---------------------------------------------------------------- lists
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  -- informational only; access comes from list_members, so the list outlives
  -- its creator leaving or deleting their account
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  target_length integer not null default 0 check (target_length between 0 and 1000),
  ranked boolean not null default true,
  add_order text not null default 'bottomUp' check (add_order in ('bottomUp', 'topDown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create index list_members_user_id_idx on public.list_members (user_id);

-- security definer so policies on lists/list_members/list_entries can check
-- membership without recursing into list_members' own policy
create function public.is_list_member(target_list_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.list_members m
    where m.list_id = target_list_id and m.user_id = auth.uid()
  );
$$;

-- Creating a list goes through this function (not a direct insert) so the
-- list and its first membership are created together — a bare insert couldn't
-- read back its own row, since reading requires the membership.
create function public.create_list(
  list_name text,
  list_target_length integer default 0,
  list_ranked boolean default true,
  list_add_order text default 'bottomUp'
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  insert into public.lists (created_by, name, target_length, ranked, add_order)
  values (auth.uid(), list_name, list_target_length, list_ranked, list_add_order)
  returning id into new_id;
  insert into public.list_members (list_id, user_id) values (new_id, auth.uid());
  return new_id;
end;
$$;

-- Leaving a list (including via account deletion) deletes it once nobody is
-- left in it.
create function public.delete_list_if_empty()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.list_members where list_id = old.list_id) then
    delete from public.lists where id = old.list_id;
  end if;
  return null;
end;
$$;

create trigger list_members_delete_empty_list
  after delete on public.list_members
  for each row execute function public.delete_list_if_empty();

alter table public.lists enable row level security;
alter table public.list_members enable row level security;

create policy "Members can read their lists"
  on public.lists for select
  to authenticated
  using (public.is_list_member(id));

create policy "Members can edit their lists"
  on public.lists for update
  to authenticated
  using (public.is_list_member(id))
  with check (public.is_list_member(id));

-- no insert policy (use create_list) and no delete policy (leave instead)

create policy "Members can see who else is on their lists"
  on public.list_members for select
  to authenticated
  using (public.is_list_member(list_id));

create policy "Members can leave a list"
  on public.list_members for delete
  to authenticated
  using (user_id = auth.uid());

-- no insert policy yet: joining a shared list arrives with invites (Phase 4)

grant select on public.lists to authenticated;
grant update (name, target_length, ranked, add_order) on public.lists to authenticated;
grant select, delete on public.list_members to authenticated;
revoke execute on function public.create_list(text, integer, boolean, text) from public, anon;
grant execute on function public.create_list(text, integer, boolean, text) to authenticated;

-- ---------------------------------------------------------------- list entries
-- One row per movie in a list. id is the entry's own id (the app's per-entry
-- uid), so the same movie can be told apart across lists. section/position
-- replace the app's separate entries / honorableMentions arrays.
create table public.list_entries (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  movie_id text not null references public.movies (id),
  section text not null default 'main' check (section in ('main', 'honorable')),
  position integer not null check (position >= 0),
  -- set null (not cascade) so a collaborator deleting their account doesn't
  -- pull the movies they added out of a shared list
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (list_id, movie_id)
);

create index list_entries_list_idx on public.list_entries (list_id, section, position);

alter table public.list_entries enable row level security;

create policy "Members can read list entries"
  on public.list_entries for select
  to authenticated
  using (public.is_list_member(list_id));

create policy "Members can add list entries"
  on public.list_entries for insert
  to authenticated
  with check (added_by = auth.uid() and public.is_list_member(list_id));

create policy "Members can reorder list entries"
  on public.list_entries for update
  to authenticated
  using (public.is_list_member(list_id))
  with check (public.is_list_member(list_id));

create policy "Members can remove list entries"
  on public.list_entries for delete
  to authenticated
  using (public.is_list_member(list_id));

grant select, insert, delete on public.list_entries to authenticated;
grant update (section, position) on public.list_entries to authenticated;

-- ---------------------------------------------------------------- updated_at
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

create trigger lists_set_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

-- Adding, removing, or reordering entries counts as editing the list, so the
-- home page's most-recently-edited ordering keeps working. security definer
-- so it doesn't depend on the editing member's update rights on lists.
create function public.touch_list_from_entry()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.lists set updated_at = now()
  where id = coalesce(new.list_id, old.list_id);
  return null;
end;
$$;

create trigger list_entries_touch_list
  after insert or update or delete on public.list_entries
  for each row execute function public.touch_list_from_entry();
