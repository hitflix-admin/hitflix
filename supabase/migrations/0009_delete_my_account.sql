-- Lets a signed-in user permanently delete their own account.
--
-- Deleting the auth user cascades through everything that references it:
--   profiles, profile_cards, reviews, game_results, activity_days,
--   list_members (lists left with no members are then deleted by the
--   list_members_delete_empty_list trigger from 0003).
-- Lists shared with others survive; entries this user added stay in them with
-- added_by cleared, and created_by is cleared on lists they started.
-- Their member number is retired, never reused.

create function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
