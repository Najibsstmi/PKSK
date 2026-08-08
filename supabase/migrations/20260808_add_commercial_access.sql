-- Commercial access model for Simulator PKSK.
-- Run this after supabase/schema.sql and supabase/seed.sql.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists subscription_status text not null default 'free';
alter table public.profiles add column if not exists subscription_plan text;
alter table public.profiles add column if not exists subscription_started_at timestamptz;
alter table public.profiles add column if not exists subscription_ends_at timestamptz;
alter table public.profiles add column if not exists access_granted_at timestamptz;
alter table public.profiles add column if not exists access_granted_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.profiles add column if not exists is_blocked boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user', 'admin', 'super_admin'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_subscription_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_subscription_status_check check (subscription_status in ('free', 'premium', 'expired', 'blocked'));
  end if;
end;
$$;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  duration_days integer,
  price numeric,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  previous_status text,
  new_status text not null,
  plan text,
  started_at timestamptz,
  ends_at timestamptz,
  changed_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role_status on public.profiles (role, subscription_status, is_blocked);
create index if not exists idx_profiles_last_login on public.profiles (last_login_at desc);
create index if not exists idx_subscription_history_user on public.subscription_history (user_id, created_at desc);
create index if not exists idx_admin_audit_logs_admin on public.admin_audit_logs (admin_user_id, created_at desc);
create index if not exists idx_admin_audit_logs_target on public.admin_audit_logs (target_user_id, created_at desc);

drop trigger if exists subscription_plans_touch_updated_at on public.subscription_plans;
create trigger subscription_plans_touch_updated_at
before update on public.subscription_plans
for each row execute function public.touch_updated_at();

create or replace function public.is_admin_user(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.role in ('admin', 'super_admin')
      and p.is_blocked = false
      and p.subscription_status <> 'blocked'
  );
$$;

create or replace function public.is_super_admin_user(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.role = 'super_admin'
      and p.is_blocked = false
      and p.subscription_status <> 'blocked'
  );
$$;

create or replace function public.is_premium_user(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.subscription_status = 'premium'
      and p.is_blocked = false
      and (p.subscription_ends_at is null or p.subscription_ends_at > now())
  );
$$;

create or replace function public.protect_profile_commercial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
begin
  if v_actor is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select role into v_actor_role
  from public.profiles
  where id = v_actor;

  if coalesce(v_actor_role, 'user') not in ('admin', 'super_admin') then
    if new.role is distinct from old.role
      or new.subscription_status is distinct from old.subscription_status
      or new.subscription_plan is distinct from old.subscription_plan
      or new.subscription_started_at is distinct from old.subscription_started_at
      or new.subscription_ends_at is distinct from old.subscription_ends_at
      or new.access_granted_at is distinct from old.access_granted_at
      or new.access_granted_by is distinct from old.access_granted_by
      or new.is_blocked is distinct from old.is_blocked
      or (
        new.last_login_at is distinct from old.last_login_at
        and coalesce(current_setting('app.allow_last_login_update', true), '') <> 'true'
      ) then
      raise exception 'PROTECTED_PROFILE_FIELDS';
    end if;
  end if;

  if v_actor_role = 'admin' and new.role is distinct from old.role then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_commercial_fields on public.profiles;
create trigger protect_profile_commercial_fields
before update on public.profiles
for each row execute function public.protect_profile_commercial_fields();

create or replace function public.record_last_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  perform set_config('app.allow_last_login_update', 'true', true);

  update public.profiles
  set last_login_at = now()
  where id = v_user_id;
end;
$$;

create or replace function public.get_my_access_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_is_expired boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'is_guest', true,
      'role', 'user',
      'subscription_status', 'free',
      'is_premium', false,
      'is_admin', false,
      'is_super_admin', false,
      'is_blocked', false,
      'is_expired', false
    );
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id;

  if v_profile.id is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  v_is_expired := v_profile.subscription_status = 'premium'
    and v_profile.subscription_ends_at is not null
    and v_profile.subscription_ends_at <= now();

  if v_is_expired then
    update public.profiles
    set subscription_status = 'expired'
    where id = v_user_id
      and subscription_status = 'premium'
      and subscription_ends_at <= now();

    v_profile.subscription_status := 'expired';
  end if;

  return jsonb_build_object(
    'is_guest', false,
    'role', v_profile.role,
    'subscription_status', case when v_profile.is_blocked then 'blocked' else v_profile.subscription_status end,
    'subscription_plan', v_profile.subscription_plan,
    'subscription_started_at', v_profile.subscription_started_at,
    'subscription_ends_at', v_profile.subscription_ends_at,
    'is_premium', public.is_premium_user(v_user_id),
    'is_admin', public.is_admin_user(v_user_id),
    'is_super_admin', public.is_super_admin_user(v_user_id),
    'is_blocked', v_profile.is_blocked or v_profile.subscription_status = 'blocked',
    'is_expired', v_profile.subscription_status = 'expired'
  );
end;
$$;

create or replace function public.get_public_app_settings()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.app_settings;
$$;

create or replace function public.get_guest_preview_questions(
  p_section text,
  p_limit integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_payload jsonb;
begin
  if p_section not in ('A', 'B') then
    raise exception 'INVALID_SECTION';
  end if;

  select coalesce(
    p_limit,
    case
      when p_section = 'A' then (select (value #>> '{}')::integer from public.app_settings where key = 'free_preview_section_a_limit')
      else (select (value #>> '{}')::integer from public.app_settings where key = 'free_preview_section_b_limit')
    end,
    5
  ) into v_limit;

  v_limit := least(greatest(v_limit, 1), 5);

  with selected_questions as (
    select q.*
    from public.questions q
    where q.is_active = true
      and q.question_type = 'objective'
      and q.section = p_section
    order by random()
    limit v_limit
  ),
  ordered_questions as (
    select sq.*, row_number() over (order by random())::integer as question_order
    from selected_questions sq
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oq.id,
      'section', oq.section,
      'category', oq.category,
      'topic', oq.topic,
      'difficulty', oq.difficulty,
      'question_text', oq.question_text,
      'question_order', oq.question_order,
      'selected_option_id', null,
      'options', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', qo.id,
            'option_text', qo.option_text,
            'option_order', row_numbered.option_order
          )
          order by row_numbered.option_order
        ), '[]'::jsonb)
        from (
          select qo2.*, row_number() over (order by random())::integer as option_order
          from public.question_options qo2
          where qo2.question_id = oq.id
        ) row_numbered
        join public.question_options qo on qo.id = row_numbered.id
      )
    )
    order by oq.question_order
  ), '[]'::jsonb)
  into v_payload
  from ordered_questions oq;

  return jsonb_build_object(
    'section', p_section,
    'limit', v_limit,
    'questions', v_payload
  );
end;
$$;

create or replace function public.score_guest_preview(p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_correct integer := 0;
  v_item jsonb;
begin
  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'INVALID_ANSWERS';
  end if;

  for v_item in select * from jsonb_array_elements(p_answers)
  loop
    v_total := v_total + 1;
    if exists (
      select 1
      from public.question_options qo
      where qo.question_id = (v_item->>'question_id')::uuid
        and qo.id = (v_item->>'selected_option_id')::uuid
        and qo.is_correct = true
    ) then
      v_correct := v_correct + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'correct_answers', v_correct,
    'total_questions', v_total,
    'percentage', case when v_total = 0 then 0 else round((v_correct::numeric / v_total::numeric) * 100, 2) end
  );
end;
$$;

create or replace function public.start_quiz(
  p_mode text,
  p_section text default null,
  p_number_of_questions integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt_id uuid;
  v_limit integer;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if not public.is_premium_user(v_user_id) then
    if exists (select 1 from public.profiles where id = v_user_id and (is_blocked = true or subscription_status = 'blocked')) then
      raise exception 'ACCOUNT_BLOCKED';
    end if;
    raise exception 'PREMIUM_REQUIRED';
  end if;

  if p_mode not in ('full', 'section', 'quick') then
    raise exception 'INVALID_MODE';
  end if;

  if p_mode = 'section' and coalesce(p_section, '') not in ('A', 'B', 'C') then
    raise exception 'INVALID_SECTION';
  end if;

  v_limit := case
    when p_mode = 'full' then coalesce(nullif(p_number_of_questions, 0), 30)
    when p_mode = 'quick' then coalesce(nullif(p_number_of_questions, 0), 10)
    else coalesce(nullif(p_number_of_questions, 0), 10)
  end;
  v_limit := least(greatest(v_limit, 1), 100);

  insert into public.quiz_attempts (user_id, mode, section, status)
  values (v_user_id, p_mode, p_section, 'in_progress')
  returning id into v_attempt_id;

  with selected_questions as (
    select q.id
    from public.questions q
    where q.is_active = true
      and q.question_type = 'objective'
      and (
        (p_mode = 'full' and q.section in ('A', 'B'))
        or (p_mode = 'quick' and q.section in ('A', 'B'))
        or (p_mode = 'section' and q.section = p_section)
      )
    order by random()
    limit v_limit
  ),
  ordered_questions as (
    select id, row_number() over (order by random())::integer as question_order
    from selected_questions
  ),
  inserted_questions as (
    insert into public.attempt_questions (attempt_id, question_id, question_order)
    select v_attempt_id, id, question_order
    from ordered_questions
    returning id, question_id
  ),
  randomized_options as (
    select
      iq.id as attempt_question_id,
      qo.id as option_id,
      row_number() over (partition by iq.id order by random())::integer as option_order
    from inserted_questions iq
    join public.question_options qo on qo.question_id = iq.question_id
  )
  insert into public.attempt_question_options (attempt_question_id, option_id, option_order)
  select attempt_question_id, option_id, option_order
  from randomized_options;

  select count(*) into v_count
  from public.attempt_questions
  where attempt_id = v_attempt_id;

  if v_count = 0 then
    delete from public.quiz_attempts where id = v_attempt_id;
    raise exception 'EMPTY_QUESTION_BANK';
  end if;

  update public.quiz_attempts
  set total_questions = v_count
  where id = v_attempt_id;

  return v_attempt_id;
end;
$$;

create or replace function public.require_admin()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if v_admin_id is null or not public.is_admin_user(v_admin_id) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return v_admin_id;
end;
$$;

create or replace function public.require_super_admin()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if v_admin_id is null or not public.is_super_admin_user(v_admin_id) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;

  return v_admin_id;
end;
$$;

create or replace function public.admin_get_kpis()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_payload jsonb;
begin
  select jsonb_build_object(
    'total_registered_users', count(*)::integer,
    'premium_users', count(*) filter (where subscription_status = 'premium' and is_blocked = false and (subscription_ends_at is null or subscription_ends_at > now()))::integer,
    'free_users', count(*) filter (where subscription_status = 'free' and is_blocked = false)::integer,
    'expired_users', count(*) filter (where subscription_status = 'expired' or (subscription_status = 'premium' and subscription_ends_at is not null and subscription_ends_at <= now()))::integer,
    'blocked_users', count(*) filter (where subscription_status = 'blocked' or is_blocked = true)::integer,
    'active_users_today', count(*) filter (where last_login_at >= date_trunc('day', now()))::integer,
    'total_quiz_attempts', (select count(*)::integer from public.quiz_attempts),
    'attempts_today', (select count(*)::integer from public.quiz_attempts where started_at >= date_trunc('day', now()))
  )
  into v_payload
  from public.profiles;

  return v_payload;
end;
$$;

create or replace function public.admin_list_users(
  search_text text default null,
  status_filter text default null,
  page_number integer default 1,
  page_size integer default 20
)
returns table (
  id uuid,
  email text,
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
    )
  )
  select filtered.*, count(*) over() as total_count
  from filtered
  order by filtered.created_at desc
  offset (v_page - 1) * v_size
  limit v_size;
end;
$$;

create or replace function public.write_subscription_history(
  target_user_id uuid,
  previous_status text,
  new_status text,
  plan_code text,
  started_at timestamptz,
  ends_at timestamptz,
  changed_by uuid,
  notes text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.subscription_history (
    user_id,
    previous_status,
    new_status,
    plan,
    started_at,
    ends_at,
    changed_by,
    notes
  )
  values (
    target_user_id,
    previous_status,
    new_status,
    plan_code,
    started_at,
    ends_at,
    changed_by,
    notes
  );
$$;

create or replace function public.write_admin_audit(
  admin_user_id uuid,
  target_user_id uuid,
  action text,
  metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_audit_logs (admin_user_id, target_user_id, action, metadata)
  values (admin_user_id, target_user_id, action, coalesce(metadata, '{}'::jsonb));
$$;

create or replace function public.admin_grant_premium(target_user_id uuid, plan text default 'monthly')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_previous_status text;
  v_duration_days integer;
  v_started_at timestamptz := now();
  v_ends_at timestamptz;
begin
  if target_user_id = v_admin_id and not public.is_super_admin_user(v_admin_id) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;

  select subscription_status into v_previous_status
  from public.profiles
  where id = target_user_id
  for update;

  if v_previous_status is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  select duration_days into v_duration_days
  from public.subscription_plans
  where code = plan and is_active = true;

  if plan = 'lifetime' then
    v_ends_at := null;
  elsif v_duration_days is not null then
    v_ends_at := v_started_at + make_interval(days => v_duration_days);
  else
    raise exception 'INVALID_PLAN';
  end if;

  update public.profiles
  set
    subscription_status = 'premium',
    subscription_plan = plan,
    subscription_started_at = v_started_at,
    subscription_ends_at = v_ends_at,
    access_granted_at = v_started_at,
    access_granted_by = v_admin_id,
    is_blocked = false
  where id = target_user_id;

  perform public.write_subscription_history(target_user_id, v_previous_status, 'premium', plan, v_started_at, v_ends_at, v_admin_id, 'grant_premium');
  perform public.write_admin_audit(v_admin_id, target_user_id, 'grant_premium', jsonb_build_object('plan', plan, 'ends_at', v_ends_at));

  return jsonb_build_object('ok', true, 'subscription_status', 'premium', 'plan', plan, 'ends_at', v_ends_at);
end;
$$;

create or replace function public.admin_extend_premium(target_user_id uuid, plan text default 'monthly')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_previous_status text;
  v_duration_days integer;
  v_base timestamptz;
  v_ends_at timestamptz;
begin
  select subscription_status, greatest(coalesce(subscription_ends_at, now()), now())
  into v_previous_status, v_base
  from public.profiles
  where id = target_user_id
  for update;

  if v_previous_status is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  select duration_days into v_duration_days
  from public.subscription_plans
  where code = plan and is_active = true;

  if plan = 'lifetime' then
    v_ends_at := null;
  elsif v_duration_days is not null then
    v_ends_at := v_base + make_interval(days => v_duration_days);
  else
    raise exception 'INVALID_PLAN';
  end if;

  update public.profiles
  set
    subscription_status = 'premium',
    subscription_plan = plan,
    subscription_started_at = coalesce(subscription_started_at, now()),
    subscription_ends_at = v_ends_at,
    access_granted_at = now(),
    access_granted_by = v_admin_id,
    is_blocked = false
  where id = target_user_id;

  perform public.write_subscription_history(target_user_id, v_previous_status, 'premium', plan, now(), v_ends_at, v_admin_id, 'extend_subscription');
  perform public.write_admin_audit(v_admin_id, target_user_id, 'extend_subscription', jsonb_build_object('plan', plan, 'ends_at', v_ends_at));

  return jsonb_build_object('ok', true, 'subscription_status', 'premium', 'plan', plan, 'ends_at', v_ends_at);
end;
$$;

create or replace function public.admin_revoke_premium(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_previous_status text;
begin
  select subscription_status into v_previous_status
  from public.profiles
  where id = target_user_id
  for update;

  if v_previous_status is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.profiles
  set
    subscription_status = 'free',
    subscription_plan = null,
    subscription_started_at = null,
    subscription_ends_at = null,
    access_granted_at = null,
    access_granted_by = null
  where id = target_user_id;

  perform public.write_subscription_history(target_user_id, v_previous_status, 'free', null, null, null, v_admin_id, 'revoke_premium');
  perform public.write_admin_audit(v_admin_id, target_user_id, 'revoke_premium', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'subscription_status', 'free');
end;
$$;

create or replace function public.admin_block_user(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_previous_status text;
begin
  if public.is_super_admin_user(target_user_id) and not public.is_super_admin_user(v_admin_id) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;

  select subscription_status into v_previous_status
  from public.profiles
  where id = target_user_id
  for update;

  if v_previous_status is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.profiles
  set subscription_status = 'blocked', is_blocked = true
  where id = target_user_id;

  perform public.write_subscription_history(target_user_id, v_previous_status, 'blocked', null, null, null, v_admin_id, 'block_user');
  perform public.write_admin_audit(v_admin_id, target_user_id, 'block_user', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'subscription_status', 'blocked');
end;
$$;

create or replace function public.admin_unblock_user(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_previous_status text;
begin
  select subscription_status into v_previous_status
  from public.profiles
  where id = target_user_id
  for update;

  if v_previous_status is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.profiles
  set subscription_status = 'free', is_blocked = false
  where id = target_user_id;

  perform public.write_subscription_history(target_user_id, v_previous_status, 'free', null, null, null, v_admin_id, 'unblock_user');
  perform public.write_admin_audit(v_admin_id, target_user_id, 'unblock_user', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'subscription_status', 'free');
end;
$$;

create or replace function public.super_admin_set_role(target_user_id uuid, new_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_super_admin();
  v_old_role text;
begin
  if new_role not in ('user', 'admin', 'super_admin') then
    raise exception 'INVALID_ROLE';
  end if;

  select role into v_old_role
  from public.profiles
  where id = target_user_id
  for update;

  if v_old_role is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.profiles
  set role = new_role
  where id = target_user_id;

  perform public.write_admin_audit(v_admin_id, target_user_id, 'change_role', jsonb_build_object('old_role', v_old_role, 'new_role', new_role));

  return jsonb_build_object('ok', true, 'role', new_role);
end;
$$;

create or replace function public.admin_list_questions(
  search_text text default null,
  page_number integer default 1,
  page_size integer default 30
)
returns table (
  id uuid,
  section text,
  category text,
  difficulty text,
  question_text text,
  is_active boolean,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_page integer := greatest(coalesce(page_number, 1), 1);
  v_size integer := least(greatest(coalesce(page_size, 30), 1), 100);
begin
  return query
  with filtered as (
    select q.id, q.section, q.category, q.difficulty, q.question_text, q.is_active, q.created_at
    from public.questions q
    where coalesce(search_text, '') = ''
      or q.question_text ilike '%' || search_text || '%'
      or q.category ilike '%' || search_text || '%'
      or q.section ilike '%' || search_text || '%'
  )
  select filtered.*, count(*) over() as total_count
  from filtered
  order by filtered.created_at desc
  offset (v_page - 1) * v_size
  limit v_size;
end;
$$;

alter table public.subscription_plans enable row level security;
alter table public.subscription_history enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "subscription plans public select" on public.subscription_plans;
create policy "subscription plans public select"
on public.subscription_plans for select
to anon, authenticated
using (is_active = true);

drop policy if exists "subscription history own select" on public.subscription_history;
create policy "subscription history own select"
on public.subscription_history for select
to authenticated
using (user_id = auth.uid() or public.is_admin_user(auth.uid()));

drop policy if exists "admin audit logs admin select" on public.admin_audit_logs;
create policy "admin audit logs admin select"
on public.admin_audit_logs for select
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists "app settings public select" on public.app_settings;
create policy "app settings public select"
on public.app_settings for select
to anon, authenticated
using (true);

grant select on public.subscription_plans to anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant select on public.subscription_history to authenticated;
grant select on public.admin_audit_logs to authenticated;

grant execute on function public.is_premium_user(uuid) to authenticated;
grant execute on function public.get_my_access_status() to anon, authenticated;
grant execute on function public.record_last_login() to authenticated;
grant execute on function public.get_public_app_settings() to anon, authenticated;
grant execute on function public.get_guest_preview_questions(text, integer) to anon, authenticated;
grant execute on function public.score_guest_preview(jsonb) to anon, authenticated;
grant execute on function public.admin_get_kpis() to authenticated;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
grant execute on function public.admin_grant_premium(uuid, text) to authenticated;
grant execute on function public.admin_extend_premium(uuid, text) to authenticated;
grant execute on function public.admin_revoke_premium(uuid) to authenticated;
grant execute on function public.admin_block_user(uuid) to authenticated;
grant execute on function public.admin_unblock_user(uuid) to authenticated;
grant execute on function public.super_admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_list_questions(text, integer, integer) to authenticated;

insert into public.subscription_plans (code, name, description, duration_days, price, is_active, sort_order)
values
  ('monthly', 'Bulanan', 'Akses premium selama 30 hari.', 30, null, true, 10),
  ('6_months', '6 Bulan', 'Akses premium selama 6 bulan.', 180, null, true, 20),
  ('yearly', 'Tahunan', 'Akses premium selama 1 tahun.', 365, null, true, 30),
  ('lifetime', 'Lifetime', 'Akses premium tanpa tarikh tamat.', null, null, true, 40)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  duration_days = excluded.duration_days,
  price = excluded.price,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;

insert into public.app_settings (key, value, description)
values
  ('free_preview_section_a_limit', '5'::jsonb, 'Maximum free preview questions for section A.'),
  ('free_preview_section_b_limit', '5'::jsonb, 'Maximum free preview questions for section B.'),
  ('free_preview_section_c_enabled', 'false'::jsonb, 'Whether section C free preview is enabled.')
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();
