-- Keep usernames' capitalization as typed (e.g. "Allfather"), while still
-- treating "Allfather" and "allfather" as the same name for uniqueness.

alter table public.profiles drop constraint profiles_username_check;
alter table public.profiles add constraint profiles_username_check
  check (username ~ '^[A-Za-z0-9_]{3,20}$');

alter table public.profiles drop constraint profiles_username_key;
create unique index profiles_username_lower_key on public.profiles (lower(username));
