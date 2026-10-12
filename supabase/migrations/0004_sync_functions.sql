-- Phase 3: functions the app calls to save lists and reviews.
-- All are security invoker (the default) except create_list, so the RLS
-- policies from 0003 still decide what each call may touch.

-- create_list now takes the list's id from the app, so a list created while
-- a save is still in flight already has its permanent id.
drop function public.create_list(text, integer, boolean, text);

create function public.create_list(
  list_id uuid,
  list_name text,
  list_target_length integer default 0,
  list_ranked boolean default true,
  list_add_order text default 'bottomUp'
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  insert into public.lists (id, created_by, name, target_length, ranked, add_order)
  values (list_id, auth.uid(), list_name, list_target_length, list_ranked, list_add_order);
  insert into public.list_members (list_id, user_id) values (list_id, auth.uid());
  return list_id;
end;
$$;

revoke execute on function public.create_list(uuid, text, integer, boolean, text) from public, anon;
grant execute on function public.create_list(uuid, text, integer, boolean, text) to authenticated;

-- Adds any movies the database hasn't seen yet. Existing rows are left as-is
-- (movies are insert-only for clients — see 0003).
-- movies: [{ id, title, page_title, year, poster_url, page_url, description, extract }]
create function public.ensure_movies(movies jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.movies (id, title, page_title, year, poster_url, page_url, description, extract)
  select distinct on (m->>'id')
    m->>'id',
    m->>'title',
    m->>'page_title',
    nullif(m->>'year', '')::smallint,
    nullif(m->>'poster_url', ''),
    nullif(m->>'page_url', ''),
    nullif(m->>'description', ''),
    nullif(m->>'extract', '')
  from jsonb_array_elements(movies) m
  on conflict (id) do nothing;
$$;

-- Makes a list's entries match what the app sends: removes entries that are
-- gone, adds new ones, and updates every entry's section and position.
-- entries: [{ id, section, position, movie: { ...as in ensure_movies } }]
create function public.sync_list_entries(target_list uuid, entries jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_list_member(target_list) then
    raise exception 'not a member of this list';
  end if;

  perform public.ensure_movies(
    coalesce((select jsonb_agg(e->'movie') from jsonb_array_elements(entries) e), '[]'::jsonb)
  );

  delete from public.list_entries le
  where le.list_id = target_list
    and le.id not in (select (e->>'id')::uuid from jsonb_array_elements(entries) e);

  insert into public.list_entries (id, list_id, movie_id, section, position)
  select (e->>'id')::uuid, target_list, e->'movie'->>'id', e->>'section', (e->>'position')::integer
  from jsonb_array_elements(entries) e
  on conflict (id) do update
    set section = excluded.section, position = excluded.position
    where public.list_entries.list_id = excluded.list_id;
end;
$$;

-- Saves (adds or replaces) the caller's rating for a movie.
create function public.save_review(
  movie jsonb,
  overall smallint,
  writing smallint,
  performance smallint,
  visuals smallint,
  audio smallint
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.ensure_movies(jsonb_build_array(movie));
  insert into public.reviews (user_id, movie_id, overall, writing, performance, visuals, audio)
  values (auth.uid(), movie->>'id', overall, writing, performance, visuals, audio)
  on conflict (user_id, movie_id) do update
    set overall = excluded.overall,
        writing = excluded.writing,
        performance = excluded.performance,
        visuals = excluded.visuals,
        audio = excluded.audio;
end;
$$;

revoke execute on function public.ensure_movies(jsonb) from public, anon;
revoke execute on function public.sync_list_entries(uuid, jsonb) from public, anon;
revoke execute on function public.save_review(jsonb, smallint, smallint, smallint, smallint, smallint) from public, anon;
grant execute on function public.ensure_movies(jsonb) to authenticated;
grant execute on function public.sync_list_entries(uuid, jsonb) to authenticated;
grant execute on function public.save_review(jsonb, smallint, smallint, smallint, smallint, smallint) to authenticated;
