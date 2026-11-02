-- "Who am I?" results go in game_results alongside the other daily games.
-- It's a guessing game like Daily Movie (won + guesses, a loss uses all 5),
-- with no hint, so hint_used is always false. Both checks from 0005 list the
-- allowed games by name, so they're replaced with versions that include it.

alter table public.game_results drop constraint game_results_game_check;
alter table public.game_results drop constraint game_results_check;

alter table public.game_results add constraint game_results_game_check
  check (game in ('dailyGame', 'dailyWinner', 'faceoff', 'nominationsFaceoff', 'whoAmI'));

alter table public.game_results add constraint game_results_check check (
  case
    when game in ('dailyGame', 'dailyWinner') then
      won is not null and guesses is not null and hint_used is not null
      and rounds_correct is null and rounds_total is null
      -- a loss always used all 5 guesses; the plot hint only unlocks for the 5th
      and (won or guesses = 5)
      and (not hint_used or guesses = 5)
    when game = 'whoAmI' then
      won is not null and guesses is not null and hint_used = false
      and rounds_correct is null and rounds_total is null
      and (won or guesses = 5)
    else
      rounds_total = 5 and rounds_correct between 0 and 5
      and won is null and guesses is null and hint_used is null
  end
);
