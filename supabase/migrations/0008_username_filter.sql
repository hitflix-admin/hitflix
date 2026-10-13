-- Blocks profanity, slurs, and site-impersonating names in usernames.
--
-- Two kinds of matching, to avoid blocking innocent names (the "Scunthorpe
-- problem" — on a movie site, think Hitchcock, Titanic, Cumberbatch):
--   anywhere: severe terms, blocked even inside other words or with digit
--             substitutions (sh1t, f4g).
--   word:     short ambiguous terms, blocked only as a standalone word —
--             words split on underscores, capital letters, and digit runs
--             (BigAss and ass_man are blocked; Assassin and Peacock aren't).
--             Also used for terms hiding inside real words: Swank (wank),
--             therapist (rapist), torpedo (pedo), badminton (admin).
--
-- The list lives in a private schema the public API doesn't expose, so it
-- can't be read or edited by clients. Add terms with:
--   insert into private.username_blocklist (term, match, reason) values ('...', 'anywhere', 'profanity');

create schema if not exists private;

create table private.username_blocklist (
  term text primary key check (term ~ '^[a-z]+$'),
  match text not null check (match in ('anywhere', 'word')),
  reason text not null check (reason in ('profanity', 'reserved'))
);

-- Defense in depth: the private schema isn't exposed by the API anyway, and
-- RLS with no policies blocks the anon/authenticated roles outright. The
-- username check reads the list through a security definer function, which
-- runs as the table owner and so isn't affected.
alter table private.username_blocklist enable row level security;

insert into private.username_blocklist (term, match, reason) values
  -- profanity and slurs, blocked anywhere
  ('fuck', 'anywhere', 'profanity'),
  ('fuk', 'anywhere', 'profanity'),
  ('fck', 'anywhere', 'profanity'),
  ('shit', 'anywhere', 'profanity'),
  ('cunt', 'anywhere', 'profanity'),
  ('bitch', 'anywhere', 'profanity'),
  ('bastard', 'anywhere', 'profanity'),
  ('asshole', 'anywhere', 'profanity'),
  ('motherf', 'anywhere', 'profanity'),
  ('whore', 'anywhere', 'profanity'),
  ('slut', 'anywhere', 'profanity'),
  ('twat', 'anywhere', 'profanity'),
  ('wank', 'word', 'profanity'),
  ('wanker', 'anywhere', 'profanity'),
  ('jizz', 'anywhere', 'profanity'),
  ('porn', 'anywhere', 'profanity'),
  ('piss', 'anywhere', 'profanity'),
  ('dildo', 'anywhere', 'profanity'),
  ('blowjob', 'anywhere', 'profanity'),
  ('handjob', 'anywhere', 'profanity'),
  ('nigg', 'anywhere', 'profanity'),
  ('nigga', 'anywhere', 'profanity'),
  ('faggot', 'anywhere', 'profanity'),
  ('fag', 'anywhere', 'profanity'),
  ('kike', 'anywhere', 'profanity'),
  ('chink', 'anywhere', 'profanity'),
  ('gook', 'anywhere', 'profanity'),
  ('wetback', 'anywhere', 'profanity'),
  ('beaner', 'anywhere', 'profanity'),
  ('raghead', 'anywhere', 'profanity'),
  ('towelhead', 'anywhere', 'profanity'),
  ('retard', 'anywhere', 'profanity'),
  ('tranny', 'anywhere', 'profanity'),
  ('dyke', 'word', 'profanity'),
  ('nazi', 'anywhere', 'profanity'),
  ('hitler', 'anywhere', 'profanity'),
  ('rapist', 'word', 'profanity'),
  ('pedo', 'word', 'profanity'),
  ('pedophile', 'anywhere', 'profanity'),
  ('molest', 'anywhere', 'profanity'),
  -- ambiguous short words, blocked only standalone (or plural)
  ('ass', 'word', 'profanity'),
  ('asses', 'word', 'profanity'),
  ('arse', 'word', 'profanity'),
  ('cock', 'word', 'profanity'),
  ('dick', 'word', 'profanity'),
  ('tit', 'word', 'profanity'),
  ('tits', 'anywhere', 'profanity'),
  ('titty', 'anywhere', 'profanity'),
  ('boob', 'word', 'profanity'),
  ('cum', 'word', 'profanity'),
  ('sex', 'word', 'profanity'),
  ('sexy', 'word', 'profanity'),
  ('anal', 'word', 'profanity'),
  ('anus', 'word', 'profanity'),
  ('penis', 'word', 'profanity'),
  ('vagina', 'word', 'profanity'),
  ('pussy', 'word', 'profanity'),
  ('rape', 'word', 'profanity'),
  ('spic', 'word', 'profanity'),
  ('coon', 'word', 'profanity'),
  ('homo', 'word', 'profanity'),
  ('kkk', 'word', 'profanity'),
  ('hoe', 'word', 'profanity'),
  -- names that could pass as the site or its staff
  ('hitflix', 'anywhere', 'reserved'),
  ('admin', 'word', 'reserved'),
  ('administrator', 'anywhere', 'reserved'),
  ('moderator', 'anywhere', 'reserved'),
  ('mod', 'word', 'reserved'),
  ('staff', 'word', 'reserved'),
  ('support', 'word', 'reserved'),
  ('official', 'word', 'reserved');

-- 'profanity' / 'reserved' if the username hits the list, else null.
create function private.username_violation(username text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  split text;
  variant text;
  compact text;
  words text[];
  hit text;
begin
  if username is null then
    return null;
  end if;
  -- word boundaries: camelCase humps and runs of 2+ digits (single digits
  -- stay put — they're usually letter stand-ins like sh1t)
  split := regexp_replace(username, '([a-z])([A-Z])', '\1_\2', 'g');
  split := regexp_replace(split, '([A-Za-z])([0-9]{2,})', '\1_\2', 'g');
  split := regexp_replace(split, '([0-9]{2,})([A-Za-z])', '\1_\2', 'g');
  split := lower(split);
  -- digit stand-ins; "1" is tried as both i and l
  foreach variant in array array[
    translate(split, '0134578', 'oieastb'),
    translate(split, '0134578', 'oleastb')
  ] loop
    compact := replace(variant, '_', '');
    words := string_to_array(variant, '_');
    select b.reason into hit
    from private.username_blocklist b
    where (b.match = 'anywhere' and position(b.term in compact) > 0)
       or (b.match = 'word' and (b.term = any (words) or b.term || 's' = any (words)))
    order by b.reason = 'profanity' desc
    limit 1;
    if hit is not null then
      return hit;
    end if;
  end loop;
  return null;
end;
$$;

create function public.check_username_allowed()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  violation text := private.username_violation(new.username);
begin
  if violation is not null then
    raise exception using
      errcode = 'P0001',
      message = 'username_not_allowed',
      detail = violation;
  end if;
  return new;
end;
$$;

create trigger profiles_check_username_allowed
  before insert or update of username on public.profiles
  for each row execute function public.check_username_allowed();
