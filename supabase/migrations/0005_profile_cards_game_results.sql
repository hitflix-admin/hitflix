-- Profile cards (the "baseball card" in the profile popup) and per-day game
-- results (the source for stats, streaks, and achievements).
--
-- Both are private to their owner for now. Once friendships exist, friends
-- get read access to cards and game stats (never to reviews).

-- ---------------------------------------------------------------- profile cards
-- Kept apart from profiles (which everyone can read, for usernames) so card
-- details can be friends-only later.
create table public.profile_cards (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  tagline text check (char_length(tagline) <= 120),
  -- doubles as the card's picture (its poster)
  favorite_movie_id text references public.movies (id),
  favorite_genre text check (char_length(favorite_genre) <= 40),
  favorite_director text check (char_length(favorite_director) <= 80),
  card_color text not null default 'cobalt'
    check (card_color in ('cobalt', 'orchid', 'caramel', 'fern', 'scarlet')),
  updated_at timestamptz not null default now()
);

alter table public.profile_cards enable row level security;

create policy "Users can read their own card"
  on public.profile_cards for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own card"
  on public.profile_cards for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can edit their own card"
  on public.profile_cards for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert on public.profile_cards to authenticated;
grant update (tagline, favorite_movie_id, favorite_genre, favorite_director, card_color)
  on public.profile_cards to authenticated;

create trigger profile_cards_set_updated_at
  before update on public.profile_cards
  for each row execute function public.set_updated_at();

-- Saves the caller's card in one call (adding the favorite movie to the
-- movies cache if needed). favorite_movie: same shape as ensure_movies, or null.
create function public.save_profile_card(
  tagline text,
  favorite_movie jsonb,
  favorite_genre text,
  favorite_director text,
  card_color text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if favorite_movie is not null then
    perform public.ensure_movies(jsonb_build_array(favorite_movie));
  end if;
  insert into public.profile_cards (user_id, tagline, favorite_movie_id, favorite_genre, favorite_director, card_color)
  values (
    auth.uid(),
    nullif(tagline, ''),
    favorite_movie->>'id',
    nullif(favorite_genre, ''),
    nullif(favorite_director, ''),
    card_color
  )
  on conflict (user_id) do update
    set tagline = excluded.tagline,
        favorite_movie_id = excluded.favorite_movie_id,
        favorite_genre = excluded.favorite_genre,
        favorite_director = excluded.favorite_director,
        card_color = excluded.card_color;
end;
$$;

revoke execute on function public.save_profile_card(text, jsonb, text, text, text) from public, anon;
grant execute on function public.save_profile_card(text, jsonb, text, text, text) to authenticated;

-- ---------------------------------------------------------------- game results
-- One row per account per game per puzzle day, written once when that day's
-- game is finished. puzzle_date is the game's own day (America/New_York reset).
create table public.game_results (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game text not null check (game in ('dailyGame', 'dailyWinner', 'faceoff', 'nominationsFaceoff')),
  puzzle_date date not null,
  -- guessing games (Daily Movie, Daily Movie Oscar Edition)
  won boolean,
  guesses smallint check (guesses between 1 and 5),
  hint_used boolean,
  -- time spent with the game on screen, start to finish
  active_seconds integer check (active_seconds between 0 and 86400),
  -- Faceoff games
  rounds_correct smallint,
  rounds_total smallint,
  completed_at timestamptz not null default now(),
  primary key (user_id, game, puzzle_date),
  check (
    case
      when game in ('dailyGame', 'dailyWinner') then
        won is not null and guesses is not null and hint_used is not null
        and rounds_correct is null and rounds_total is null
        -- a loss always used all 5 guesses; the plot hint only unlocks for the 5th
        and (won or guesses = 5)
        and (not hint_used or guesses = 5)
      else
        rounds_total = 5 and rounds_correct between 0 and 5
        and won is null and guesses is null and hint_used is null
    end
  )
);

alter table public.game_results enable row level security;

create policy "Users can read their own game results"
  on public.game_results for select
  to authenticated
  using (auth.uid() = user_id);

-- Only today's puzzle (give or take a day, for finishing just past midnight or
-- a device clock that's a little off) — so history can't be backfilled to
-- fake a streak.
create policy "Users can record today's game results"
  on public.game_results for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and puzzle_date between (now() at time zone 'America/New_York')::date - 1
                        and (now() at time zone 'America/New_York')::date + 1
  );

-- no update/delete: a finished day's result is final

grant select, insert on public.game_results to authenticated;
