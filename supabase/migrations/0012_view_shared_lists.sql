-- Anyone with a list's join link can view the list, even signed out.
-- Signed in, they can also join it to edit (join_list_by_link, 0011).
-- Turning the link off or resetting it stops both.
--
-- Viewers see the list's name, its movies in order, how many people are on
-- it, and who made the link — never anyone's ratings, and not who added what.

-- The list a join link points at, or null if the link was reset or turned off.
create function public.view_shared_list(link_token text)
returns jsonb
language sql
stable
security definer set search_path = ''
as $$
  select jsonb_build_object(
    'list_id', l.id,
    'name', l.name,
    'ranked', l.ranked,
    'target_length', l.target_length,
    -- the link's creator, while they're still on the list
    'shared_by', case
      when exists (select 1 from public.list_members m where m.list_id = l.id and m.user_id = j.created_by)
      then p.username
    end,
    'member_count', (select count(*) from public.list_members m where m.list_id = l.id),
    'already_member', exists (
      select 1 from public.list_members m where m.list_id = l.id and m.user_id = auth.uid()
    ),
    'entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'section', e.section,
          'movie', jsonb_build_object(
            'id', mv.id, 'title', mv.title, 'page_title', mv.page_title, 'year', mv.year,
            'poster_url', mv.poster_url, 'page_url', mv.page_url,
            'description', mv.description, 'extract', mv.extract
          )
        )
        order by e.section = 'honorable', e.position
      )
      from public.list_entries e
      join public.movies mv on mv.id = e.movie_id
      where e.list_id = l.id
    ), '[]'::jsonb)
  )
  from public.list_join_links j
  join public.lists l on l.id = j.list_id
  left join public.profiles p on p.id = j.created_by
  where j.token = link_token;
$$;

revoke execute on function public.view_shared_list(text) from public;
grant execute on function public.view_shared_list(text) to anon, authenticated;

-- replaced by view_shared_list
drop function public.join_link_info(text);
