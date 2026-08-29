insert into public.app_settings (key, value, description)
values ('social_proof_user_base_count', '1000'::jsonb, 'Baseline user count used for public social proof display.')
on conflict (key) do nothing;

create or replace function public.get_public_social_proof_stats()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with settings as (
    select coalesce(
      nullif((select value #>> '{}' from public.app_settings where key = 'social_proof_user_base_count'), '')::integer,
      1000
    ) as base_users
  ),
  profile_counts as (
    select count(*)::integer as registered_users
    from public.profiles
    where is_blocked = false
  )
  select jsonb_build_object(
    'registered_users', profile_counts.registered_users,
    'display_users', settings.base_users + profile_counts.registered_users
  )
  from settings, profile_counts;
$$;

grant execute on function public.get_public_social_proof_stats() to anon, authenticated;
