-- Phase 5: the Hitflix score — the average of everyone's ratings for a movie.
--
-- A movie only gets a score once enough people have rated it, and the bar
-- rises as the site grows, so a published score always rests on a sample
-- that's healthy for the size of the userbase. "Size" means reviewers:
-- accounts that have rated at least one movie (empty sign-ups don't count).
--
--   reviewers         ratings needed
--   1 – 49            3
--   50 – 99           5
--   100 – 999         10
--   1,000 – 4,999     25
--   5,000 – 9,999     50
--   10,000 – 24,999   75
--   25,000+           100 (never higher)
--
-- On top of that, an account's ratings only count toward any movie's score
-- once it has rated at least hitflix_min_reviews_per_account() movies (2 for
-- now) — quality control against throwaway accounts made to review-bomb one
-- movie. To raise it, replace that function with a new number.
--
-- The bar is always the current one: when the site crosses a tier, a movie
-- below the new bar loses its score until it catches up.
--
-- Individual ratings stay private: hitflix_scores returns only the rounded
-- average for movies that clear the bar — no rating counts, nothing for
-- movies below it. Deleted accounts' reviews are already gone (cascade in
-- 0003). Leaving out suspended accounts arrives with suspensions.
--
-- To check the current bar in the SQL Editor:
--   select public.hitflix_reviewer_count(), public.hitflix_min_ratings();

create function public.hitflix_min_reviews_per_account()
returns integer
language sql
stable
set search_path = ''
as $$
  select 2;
$$;

create function public.hitflix_min_ratings_for(reviewers bigint)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when reviewers >= 25000 then 100
    when reviewers >= 10000 then 75
    when reviewers >= 5000 then 50
    when reviewers >= 1000 then 25
    when reviewers >= 100 then 10
    when reviewers >= 50 then 5
    else 3
  end;
$$;

create function public.hitflix_reviewer_count()
returns bigint
language sql
stable
security definer set search_path = ''
as $$
  select count(distinct user_id) from public.reviews;
$$;

create function public.hitflix_min_ratings()
returns integer
language sql
stable
security definer set search_path = ''
as $$
  select public.hitflix_min_ratings_for(public.hitflix_reviewer_count());
$$;

-- Scores for up to 200 movies at once, counting only accounts that clear the
-- per-account bar. Movies without a score (too few counted ratings, or none)
-- are simply left out of the result.
create function public.hitflix_scores(movie_ids text[])
returns table (movie_id text, score smallint)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  min_ratings integer;
begin
  if cardinality(movie_ids) > 200 then
    raise exception 'too many movies';
  end if;
  min_ratings := public.hitflix_min_ratings();
  return query
    select r.movie_id, round(avg(r.score))::smallint
    from public.reviews r
    where r.movie_id = any (movie_ids)
      and r.user_id in (
        select q.user_id from public.reviews q
        group by q.user_id
        having count(*) >= public.hitflix_min_reviews_per_account()
      )
    group by r.movie_id
    having count(*) >= min_ratings;
end;
$$;

-- The bar helpers are for the SQL Editor only; the score itself is public,
-- signed in or not.
revoke execute on function public.hitflix_min_ratings_for(bigint) from public, anon, authenticated;
revoke execute on function public.hitflix_reviewer_count() from public, anon, authenticated;
revoke execute on function public.hitflix_min_ratings() from public, anon, authenticated;
revoke execute on function public.hitflix_min_reviews_per_account() from public, anon, authenticated;
revoke execute on function public.hitflix_scores(text[]) from public;
grant execute on function public.hitflix_scores(text[]) to anon, authenticated;
