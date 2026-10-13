-- Member numbers: every account's permanent signup position on Hitflix (#1 is
-- the first account ever made). Shown next to usernames but never part of
-- them. Readable by anyone, like usernames.

create sequence public.profiles_member_number_seq;

alter table public.profiles
  add column member_number bigint unique
  default nextval('public.profiles_member_number_seq');

alter sequence public.profiles_member_number_seq owned by public.profiles.member_number;

-- Existing accounts get numbers in the order they signed up, and the counter
-- continues after the last one.
update public.profiles p
set member_number = numbered.n
from (
  select p2.id, row_number() over (order by u.created_at, p2.id) as n
  from public.profiles p2
  join auth.users u on u.id = p2.id
) numbered
where p.id = numbered.id;

select setval(
  'public.profiles_member_number_seq',
  greatest((select max(member_number) from public.profiles), 1),
  (select count(*) > 0 from public.profiles)
);

alter table public.profiles alter column member_number set not null;

-- A member number is permanent: users can edit their own profile row, so make
-- sure no update can change it.
create function public.keep_member_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.member_number = old.member_number;
  return new;
end;
$$;

create trigger profiles_keep_member_number
  before update on public.profiles
  for each row execute function public.keep_member_number();
