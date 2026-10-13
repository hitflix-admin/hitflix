-- Usernames: 3–16 characters (was 3–20), so the account button can always
-- show the full name plus member number without truncating, even on phones.

alter table public.profiles drop constraint profiles_username_check;
alter table public.profiles add constraint profiles_username_check
  check (username ~ '^[A-Za-z0-9_]{3,16}$');
