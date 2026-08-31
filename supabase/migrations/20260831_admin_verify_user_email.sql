drop function if exists public.admin_list_users(text, text, integer, integer);

create or replace function public.admin_list_users(
  search_text text default null,
  status_filter text default null,
  page_number integer default 1,
  page_size integer default 20
)
returns table (
  id uuid,
  email text,
  email_confirmed_at timestamptz,
  full_name text,
  display_name text,
  school text,
  state text,
  role text,
  subscription_status text,
  subscription_plan text,
  subscription_started_at timestamptz,
  subscription_ends_at timestamptz,
  created_at timestamptz,
  last_login_at timestamptz,
  is_blocked boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_page integer := greatest(coalesce(page_number, 1), 1);
  v_size integer := least(greatest(coalesce(page_size, 20), 1), 100);
begin
  return query
  with filtered as (
    select
      p.id,
      au.email::text,
      au.email_confirmed_at,
      p.full_name,
      p.display_name,
      p.school,
      p.state,
      p.role,
      case when p.is_blocked then 'blocked' else p.subscription_status end as subscription_status,
      p.subscription_plan,
      p.subscription_started_at,
      p.subscription_ends_at,
      p.created_at,
      p.last_login_at,
      p.is_blocked
    from public.profiles p
    join auth.users au on au.id = p.id
    where (
      coalesce(search_text, '') = ''
      or p.full_name ilike '%' || search_text || '%'
      or p.display_name ilike '%' || search_text || '%'
      or p.school ilike '%' || search_text || '%'
      or au.email ilike '%' || search_text || '%'
    )
    and (
      coalesce(status_filter, '') = ''
      or status_filter = 'all'
      or (status_filter = 'admin' and p.role in ('admin', 'super_admin'))
      or (status_filter = 'blocked' and (p.is_blocked = true or p.subscription_status = 'blocked'))
      or (status_filter = 'expired' and (p.subscription_status = 'expired' or (p.subscription_status = 'premium' and p.subscription_ends_at is not null and p.subscription_ends_at <= now())))
      or (status_filter = 'premium' and p.subscription_status = 'premium' and p.is_blocked = false and (p.subscription_ends_at is null or p.subscription_ends_at > now()))
      or (status_filter = 'free' and p.subscription_status = 'free' and p.is_blocked = false)
      or (status_filter = 'unverified' and au.email_confirmed_at is null)
    )
  )
  select filtered.*, count(*) over() as total_count
  from filtered
  order by filtered.created_at desc
  offset (v_page - 1) * v_size
  limit v_size;
end;
$$;

create or replace function public.admin_verify_user_email(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_email text;
  v_was_verified boolean;
  v_confirmed_at timestamptz;
begin
  select email::text, email_confirmed_at is not null
  into v_email, v_was_verified
  from auth.users
  where id = target_user_id
  for update;

  if v_email is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  update auth.users
  set
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
  where id = target_user_id
  returning email_confirmed_at into v_confirmed_at;

  perform public.write_admin_audit(
    v_admin_id,
    target_user_id,
    'verify_user_email',
    jsonb_build_object(
      'email', v_email,
      'was_verified', v_was_verified,
      'email_confirmed_at', v_confirmed_at
    )
  );

  return jsonb_build_object(
    'ok', true,
    'user_id', target_user_id,
    'email', v_email,
    'email_confirmed_at', v_confirmed_at,
    'already_verified', v_was_verified
  );
end;
$$;

grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
grant execute on function public.admin_verify_user_email(uuid) to authenticated;
