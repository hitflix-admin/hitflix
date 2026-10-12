-- Phase 1: accounts.
-- Run this once in the Supabase dashboard (SQL Editor → New query → paste → Run),
-- or with the Supabase CLI (`supabase db push`).
--
-- auth.users is managed by Supabase Auth; profiles holds the public-facing
-- bits (username, display name) keyed by the same id.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- null until the user picks one on first sign-in (see UsernameModal)
  username text unique
    check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  created_at timestamptz not null default now()
);

-- Every new auth user gets an (empty) profile row automatically, so the app
-- never has to handle "signed in but no profile".
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(new.raw_user_meta_data ->> 'full_name', 40));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row-level security: the anon key is public, so these policies are what
-- actually protect the data.
alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert/delete policies: inserts come only from the trigger above, and
-- deletes cascade from auth.users when an account is deleted.

-- Explicit grants, so this works even with the dashboard's "automatically
-- expose new tables" setting turned off. RLS above still decides which rows.
grant select on public.profiles to anon, authenticated;
grant update (username, display_name) on public.profiles to authenticated;
