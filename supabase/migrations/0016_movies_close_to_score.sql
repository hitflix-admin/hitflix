-- "Contribute to the official Hitflix score": a home-page section, for
-- signed-in players, suggesting movies that other people have rated but
-- that don't have a Hitflix score yet (0015), the ones closest to the bar
-- first.
--
-- Closest = the most ratings that count toward the score (accounts that
-- clear hitflix_min_reviews_per_account), then the most ratings of any kind
-- (from accounts that may soon count), then the most recently rated. Movies
-- the caller has already rated are left out.
--
-- Only the movies come back — never how many ratings they have or who gave
-- them, so individual ratings stay private.

create function public.movies_close_to_score(max_movies integer default 3)
returns setof public.movies
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  min_ratings integer;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  min_ratings := public.hitflix_min_ratings();
  return query
    with counted_accounts as (
      select q.user_id from public.reviews q
      group by q.user_id
      having count(*) >= public.hitflix_min_reviews_per_account()
    ),
    tallies as (
      select r.movie_id,
        count(*) filter (where r.user_id in (select user_id from counted_accounts)) as counted,
        count(*) as total,
        max(r.updated_at) as last_rated
      from public.reviews r
      where r.user_id <> auth.uid()
      group by r.movie_id
    )
    select m.*
    from tallies t
    join public.movies m on m.id = t.movie_id
    where t.counted < min_ratings
      and not exists (
        select 1 from public.reviews mine
        where mine.user_id = auth.uid() and mine.movie_id = t.movie_id
      )
    order by t.counted desc, t.total desc, t.last_rated desc
    limit least(greatest(coalesce(max_movies, 3), 0), 20);
end;
$$;

revoke execute on function public.movies_close_to_score(integer) from public, anon;
grant execute on function public.movies_close_to_score(integer) to authenticated;
