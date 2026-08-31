create extension if not exists pgcrypto;

alter table public.profiles add column if not exists marketing_consent boolean not null default false;
alter table public.profiles add column if not exists marketing_consent_at timestamptz;
alter table public.profiles add column if not exists marketing_consent_source text;
alter table public.profiles add column if not exists marketing_consent_revoked_at timestamptz;
alter table public.profiles add column if not exists email_marketing_unsubscribed_at timestamptz;
alter table public.profiles add column if not exists email_marketing_unsubscribe_source text;
alter table public.profiles add column if not exists zoho_last_synced_at timestamptz;
alter table public.profiles add column if not exists zoho_last_sync_status text;
alter table public.profiles add column if not exists zoho_last_sync_error text;
alter table public.profiles add column if not exists zoho_contact_status text;

create table if not exists public.zoho_contact_sync_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  desired_segment text,
  status text not null default 'pending',
  source text,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  last_response jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zoho_contact_sync_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.zoho_contact_sync_queue(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  email_masked text,
  action text not null,
  desired_segment text,
  status text not null,
  attempt_count integer not null default 0,
  error_code text,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.zoho_contact_field_mappings (
  field_label text primary key,
  field_name text,
  field_id text,
  is_required boolean not null default true,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.zoho_contact_field_mappings (field_label, is_required)
values
  ('Contact Email', true),
  ('First Name', false),
  ('Last Name', false),
  ('Supabase User ID', true),
  ('Subscription Status', true),
  ('Subscription Plan', true),
  ('Is Premium', true),
  ('Is Blocked', true),
  ('PKSK Source', true),
  ('Last Synced At', true)
on conflict (field_label) do update set
  is_required = excluded.is_required,
  updated_at = now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'zoho_contact_sync_queue_event_type_check'
      and conrelid = 'public.zoho_contact_sync_queue'::regclass
  ) then
    alter table public.zoho_contact_sync_queue
      add constraint zoho_contact_sync_queue_event_type_check
      check (event_type in ('user_registered', 'subscription_changed', 'marketing_consent_changed', 'manual_resync', 'backfill'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zoho_contact_sync_queue_status_check'
      and conrelid = 'public.zoho_contact_sync_queue'::regclass
  ) then
    alter table public.zoho_contact_sync_queue
      add constraint zoho_contact_sync_queue_status_check
      check (status in ('pending', 'processing', 'succeeded', 'failed', 'skipped'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zoho_contact_sync_queue_desired_segment_check'
      and conrelid = 'public.zoho_contact_sync_queue'::regclass
  ) then
    alter table public.zoho_contact_sync_queue
      add constraint zoho_contact_sync_queue_desired_segment_check
      check (desired_segment is null or desired_segment in ('prospect', 'premium', 'expired', 'blocked', 'skipped'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zoho_contact_sync_logs_status_check'
      and conrelid = 'public.zoho_contact_sync_logs'::regclass
  ) then
    alter table public.zoho_contact_sync_logs
      add constraint zoho_contact_sync_logs_status_check
      check (status in ('success', 'failed', 'skipped', 'retrying', 'info'));
  end if;
end;
$$;

create index if not exists idx_profiles_zoho_last_sync on public.profiles (zoho_last_synced_at, updated_at);
create index if not exists idx_profiles_marketing_consent on public.profiles (marketing_consent, email_marketing_unsubscribed_at);
create index if not exists idx_zoho_sync_queue_status_next on public.zoho_contact_sync_queue (status, next_attempt_at, created_at);
create index if not exists idx_zoho_sync_queue_user_created on public.zoho_contact_sync_queue (user_id, created_at desc);
create unique index if not exists idx_zoho_sync_queue_pending_user on public.zoho_contact_sync_queue (user_id) where status = 'pending';
create index if not exists idx_zoho_sync_logs_user_created on public.zoho_contact_sync_logs (user_id, created_at desc);
create index if not exists idx_zoho_sync_logs_status_created on public.zoho_contact_sync_logs (status, created_at desc);

drop trigger if exists zoho_contact_sync_queue_touch_updated_at on public.zoho_contact_sync_queue;
create trigger zoho_contact_sync_queue_touch_updated_at
before update on public.zoho_contact_sync_queue
for each row execute function public.touch_updated_at();

drop trigger if exists zoho_contact_field_mappings_touch_updated_at on public.zoho_contact_field_mappings;
create trigger zoho_contact_field_mappings_touch_updated_at
before update on public.zoho_contact_field_mappings
for each row execute function public.touch_updated_at();

create or replace function public.is_valid_email(p_email text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_email, '') ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$';
$$;

create or replace function public.mask_email(p_email text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(p_email, '')), '') is null then null
    when position('@' in p_email) <= 1 then '***'
    else left(split_part(p_email, '@', 1), 2) || '***@' || split_part(p_email, '@', 2)
  end;
$$;

create or replace function public.zoho_effective_subscription_status(
  p_subscription_status text,
  p_subscription_ends_at timestamptz,
  p_is_blocked boolean
)
returns text
language sql
stable
as $$
  select case
    when coalesce(p_is_blocked, false) or p_subscription_status = 'blocked' then 'blocked'
    when p_subscription_status = 'premium' and p_subscription_ends_at is not null and p_subscription_ends_at <= now() then 'expired'
    when p_subscription_status in ('free', 'premium', 'expired') then p_subscription_status
    else 'skipped'
  end;
$$;

create or replace function public.zoho_segment_for_status(p_effective_status text)
returns text
language sql
immutable
as $$
  select case
    when p_effective_status = 'free' then 'prospect'
    when p_effective_status = 'premium' then 'premium'
    when p_effective_status = 'expired' then 'expired'
    when p_effective_status = 'blocked' then 'blocked'
    else 'skipped'
  end;
$$;

create or replace function public.zoho_get_contact_desired_state(
  p_user_id uuid,
  p_source text default 'manual_resync'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_email text;
  v_raw_user_meta_data jsonb;
  v_auth_created_at timestamptz;
  v_auth_updated_at timestamptz;
  v_auth_deleted_at timestamptz;
  v_effective_status text;
  v_desired_segment text;
  v_display_name text;
  v_full_name text;
  v_first_name text;
  v_last_name text;
  v_is_premium boolean;
  v_is_blocked boolean;
  v_marketing_eligible boolean;
  v_skip_reason text;
begin
  select *
  into v_profile
  from public.profiles
  where id = p_user_id;

  select
    lower(btrim(coalesce(au.email, ''))),
    au.raw_user_meta_data,
    au.created_at,
    au.updated_at,
    au.deleted_at
  into v_email, v_raw_user_meta_data, v_auth_created_at, v_auth_updated_at, v_auth_deleted_at
  from auth.users au
  where au.id = p_user_id;

  if v_profile.id is null then
    return jsonb_build_object('syncable', false, 'user_id', p_user_id, 'skip_reason', 'PROFILE_NOT_FOUND');
  end if;

  v_display_name := nullif(btrim(coalesce(v_profile.display_name, '')), '');
  v_full_name := coalesce(
    nullif(btrim(coalesce(v_profile.full_name, '')), ''),
    v_display_name,
    nullif(btrim(coalesce(v_raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(v_raw_user_meta_data ->> 'display_name', '')), ''),
    nullif(btrim(coalesce(v_raw_user_meta_data ->> 'name', '')), ''),
    split_part(v_email, '@', 1)
  );
  v_display_name := coalesce(v_display_name, v_full_name);
  v_first_name := split_part(coalesce(v_full_name, ''), ' ', 1);
  v_last_name := nullif(btrim(regexp_replace(coalesce(v_full_name, ''), '^\S+\s*', '')), '');
  v_effective_status := public.zoho_effective_subscription_status(v_profile.subscription_status, v_profile.subscription_ends_at, v_profile.is_blocked);
  v_desired_segment := public.zoho_segment_for_status(v_effective_status);
  v_is_premium := v_effective_status = 'premium' and public.is_premium_user(p_user_id);
  v_is_blocked := v_effective_status = 'blocked';
  v_marketing_eligible := coalesce(v_profile.marketing_consent, false)
    and v_profile.email_marketing_unsubscribed_at is null
    and not v_is_blocked
    and v_email is not null
    and public.is_valid_email(v_email);

  if v_email is null or v_email = '' then
    v_skip_reason := 'EMAIL_MISSING';
  elsif not public.is_valid_email(v_email) then
    v_skip_reason := 'INVALID_EMAIL';
  elsif v_auth_deleted_at is not null then
    v_skip_reason := 'DELETED_USER';
  elsif v_profile.role in ('admin', 'super_admin') then
    v_skip_reason := 'ADMIN_EXCLUDED';
  elsif v_effective_status = 'skipped' then
    v_skip_reason := 'UNKNOWN_SUBSCRIPTION_STATUS';
  elsif v_is_blocked then
    v_skip_reason := 'BLOCKED';
  elsif v_profile.email_marketing_unsubscribed_at is not null then
    v_skip_reason := 'UNSUBSCRIBED';
  elsif not coalesce(v_profile.marketing_consent, false) then
    v_skip_reason := 'MARKETING_CONSENT_NOT_CONFIRMED';
  end if;

  return jsonb_build_object(
    'syncable', v_skip_reason is null,
    'skip_reason', v_skip_reason,
    'user_id', p_user_id,
    'email', v_email,
    'email_masked', public.mask_email(v_email),
    'full_name', v_full_name,
    'display_name', v_display_name,
    'first_name', v_first_name,
    'last_name', v_last_name,
    'role', v_profile.role,
    'subscription_status', v_effective_status,
    'subscription_plan', v_profile.subscription_plan,
    'registration_date', v_auth_created_at,
    'auth_updated_at', v_auth_updated_at,
    'profile_updated_at', v_profile.updated_at,
    'subscription_started_at', v_profile.subscription_started_at,
    'subscription_ends_at', v_profile.subscription_ends_at,
    'is_premium', v_is_premium,
    'is_blocked', v_is_blocked,
    'marketing_consent', coalesce(v_profile.marketing_consent, false),
    'marketing_consent_at', v_profile.marketing_consent_at,
    'marketing_consent_source', v_profile.marketing_consent_source,
    'email_marketing_unsubscribed_at', v_profile.email_marketing_unsubscribed_at,
    'marketing_eligible', v_marketing_eligible,
    'desired_segment', v_desired_segment,
    'source', coalesce(nullif(btrim(p_source), ''), 'manual_resync'),
    'last_synced_at', now()
  );
end;
$$;

create or replace function public.enqueue_zoho_contact_sync(
  p_user_id uuid,
  p_event_type text default 'manual_resync',
  p_source text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text := coalesce(nullif(btrim(p_event_type), ''), 'manual_resync');
  v_state jsonb;
  v_desired_segment text;
  v_queue_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  if v_event_type not in ('user_registered', 'subscription_changed', 'marketing_consent_changed', 'manual_resync', 'backfill') then
    v_event_type := 'manual_resync';
  end if;

  v_state := public.zoho_get_contact_desired_state(p_user_id, coalesce(p_source, v_event_type));
  v_desired_segment := coalesce(v_state ->> 'desired_segment', 'skipped');

  update public.zoho_contact_sync_queue
  set
    event_type = v_event_type,
    desired_segment = v_desired_segment,
    source = coalesce(nullif(btrim(p_source), ''), v_event_type),
    status = 'pending',
    next_attempt_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null,
    processed_at = null
  where user_id = p_user_id
    and status = 'pending'
  returning id into v_queue_id;

  if v_queue_id is not null then
    return v_queue_id;
  end if;

  insert into public.zoho_contact_sync_queue (user_id, event_type, desired_segment, source)
  values (p_user_id, v_event_type, v_desired_segment, coalesce(nullif(btrim(p_source), ''), v_event_type))
  returning id into v_queue_id;

  return v_queue_id;
exception
  when unique_violation then
    update public.zoho_contact_sync_queue
    set
      event_type = v_event_type,
      desired_segment = v_desired_segment,
      source = coalesce(nullif(btrim(p_source), ''), v_event_type),
      status = 'pending',
      next_attempt_at = now(),
      locked_at = null,
      locked_by = null,
      last_error = null,
      processed_at = null
    where user_id = p_user_id
      and status = 'pending'
    returning id into v_queue_id;

    return v_queue_id;
end;
$$;

create or replace function public.zoho_profile_sync_enqueue_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text := 'subscription_changed';
begin
  if coalesce(current_setting('app.skip_zoho_enqueue', true), '') = 'true' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and (
      new.marketing_consent is distinct from old.marketing_consent
      or new.marketing_consent_at is distinct from old.marketing_consent_at
      or new.marketing_consent_revoked_at is distinct from old.marketing_consent_revoked_at
      or new.email_marketing_unsubscribed_at is distinct from old.email_marketing_unsubscribed_at
    )
  then
    v_event_type := 'marketing_consent_changed';
  end if;

  begin
    perform public.enqueue_zoho_contact_sync(new.id, v_event_type, v_event_type);
  exception
    when others then
      null;
  end;

  return new;
end;
$$;

drop trigger if exists zoho_profile_subscription_sync on public.profiles;
create trigger zoho_profile_subscription_sync
after update of subscription_status, subscription_plan, subscription_started_at, subscription_ends_at, is_blocked, marketing_consent, marketing_consent_at, marketing_consent_revoked_at, email_marketing_unsubscribed_at on public.profiles
for each row
when (
  old.subscription_status is distinct from new.subscription_status
  or old.subscription_plan is distinct from new.subscription_plan
  or old.subscription_started_at is distinct from new.subscription_started_at
  or old.subscription_ends_at is distinct from new.subscription_ends_at
  or old.is_blocked is distinct from new.is_blocked
  or old.marketing_consent is distinct from new.marketing_consent
  or old.marketing_consent_at is distinct from new.marketing_consent_at
  or old.marketing_consent_revoked_at is distinct from new.marketing_consent_revoked_at
  or old.email_marketing_unsubscribed_at is distinct from new.email_marketing_unsubscribed_at
)
execute function public.zoho_profile_sync_enqueue_trigger();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marketing_consent boolean := lower(coalesce(new.raw_user_meta_data ->> 'marketing_consent', 'false')) in ('true', '1', 'yes');
begin
  insert into public.profiles (
    id,
    full_name,
    display_name,
    marketing_consent,
    marketing_consent_at,
    marketing_consent_source
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    v_marketing_consent,
    case when v_marketing_consent then now() else null end,
    case when v_marketing_consent then coalesce(nullif(new.raw_user_meta_data ->> 'marketing_consent_source', ''), 'signup') else null end
  )
  on conflict (id) do nothing;

  begin
    perform public.enqueue_zoho_contact_sync(new.id, 'user_registered', 'signup');
  exception
    when others then
      null;
  end;

  return new;
end;
$$;

create or replace function public.admin_zoho_backfill_preview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_payload jsonb;
begin
  with base as (
    select
      au.id as user_id,
      lower(btrim(coalesce(au.email, ''))) as email,
      au.deleted_at,
      p.id is not null as has_profile,
      coalesce(p.role, 'user') as role,
      coalesce(p.marketing_consent, false) as marketing_consent,
      p.email_marketing_unsubscribed_at,
      public.zoho_effective_subscription_status(p.subscription_status, p.subscription_ends_at, p.is_blocked) as effective_status
    from auth.users au
    left join public.profiles p on p.id = au.id
  ),
  classified as (
    select
      *,
      public.is_valid_email(email) as valid_email,
      public.zoho_segment_for_status(effective_status) as desired_segment
    from base
  )
  select jsonb_build_object(
    'total_auth_users', count(*)::integer,
    'with_profile', count(*) filter (where has_profile)::integer,
    'missing_profile', count(*) filter (where not has_profile)::integer,
    'eligible_users', count(*) filter (
      where has_profile
        and deleted_at is null
        and valid_email
        and role not in ('admin', 'super_admin')
        and effective_status in ('free', 'premium', 'expired')
        and marketing_consent = true
        and email_marketing_unsubscribed_at is null
    )::integer,
    'prospects', count(*) filter (where desired_segment = 'prospect' and has_profile and deleted_at is null and valid_email and role not in ('admin', 'super_admin'))::integer,
    'premium', count(*) filter (where desired_segment = 'premium' and has_profile and deleted_at is null and valid_email and role not in ('admin', 'super_admin'))::integer,
    'expired', count(*) filter (where desired_segment = 'expired' and has_profile and deleted_at is null and valid_email and role not in ('admin', 'super_admin'))::integer,
    'blocked', count(*) filter (where desired_segment = 'blocked' and has_profile and deleted_at is null and valid_email and role not in ('admin', 'super_admin'))::integer,
    'invalid_email', count(*) filter (where has_profile and deleted_at is null and not valid_email)::integer,
    'deleted_users', count(*) filter (where deleted_at is not null)::integer,
    'admin_internal_excluded', count(*) filter (where role in ('admin', 'super_admin'))::integer,
    'marketing_consent_true', count(*) filter (where marketing_consent = true and has_profile)::integer,
    'marketing_consent_false_or_unknown', count(*) filter (where marketing_consent = false and has_profile)::integer,
    'unsubscribed', count(*) filter (where email_marketing_unsubscribed_at is not null)::integer,
    'not_confirmed_for_marketing', count(*) filter (
      where has_profile
        and deleted_at is null
        and valid_email
        and role not in ('admin', 'super_admin')
        and effective_status in ('free', 'premium', 'expired')
        and marketing_consent = false
    )::integer
  )
  into v_payload
  from classified;

  return v_payload;
end;
$$;

create or replace function public.admin_zoho_get_dashboard()
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
    'queue_pending', count(*) filter (where status = 'pending')::integer,
    'queue_processing', count(*) filter (where status = 'processing')::integer,
    'queue_failed', count(*) filter (where status = 'failed')::integer,
    'queue_succeeded', count(*) filter (where status = 'succeeded')::integer,
    'queue_skipped', count(*) filter (where status = 'skipped')::integer,
    'last_successful_sync', (select max(created_at) from public.zoho_contact_sync_logs where status = 'success'),
    'last_failed_sync', (select max(created_at) from public.zoho_contact_sync_logs where status = 'failed'),
    'field_mappings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'field_label', field_label,
        'field_name', field_name,
        'field_id', field_id,
        'is_required', is_required,
        'last_verified_at', last_verified_at
      ) order by field_label), '[]'::jsonb)
      from public.zoho_contact_field_mappings
    ),
    'preview', public.admin_zoho_backfill_preview()
  )
  into v_payload
  from public.zoho_contact_sync_queue;

  return coalesce(v_payload, jsonb_build_object(
    'queue_pending', 0,
    'queue_processing', 0,
    'queue_failed', 0,
    'queue_succeeded', 0,
    'queue_skipped', 0,
    'last_successful_sync', null,
    'last_failed_sync', null,
    'field_mappings', '[]'::jsonb,
    'preview', public.admin_zoho_backfill_preview()
  ));
end;
$$;

create or replace function public.admin_zoho_enqueue_backfill(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
  v_user record;
  v_enqueued integer := 0;
  v_queue_id uuid;
begin
  for v_user in
    select p.id
    from public.profiles p
    join auth.users au on au.id = p.id
    where au.deleted_at is null
      and lower(btrim(coalesce(au.email, ''))) <> ''
      and p.role not in ('admin', 'super_admin')
      and (
        p.zoho_last_synced_at is null
        or greatest(p.updated_at, au.updated_at) > p.zoho_last_synced_at
        or p.zoho_last_sync_status = 'failed'
      )
    order by coalesce(p.zoho_last_synced_at, '-infinity'::timestamptz), au.created_at
    limit v_limit
  loop
    v_queue_id := public.enqueue_zoho_contact_sync(v_user.id, 'backfill', 'backfill');
    if v_queue_id is not null then
      v_enqueued := v_enqueued + 1;
    end if;
  end loop;

  perform public.write_admin_audit(v_admin_id, null, 'zoho_backfill_enqueue', jsonb_build_object('limit', v_limit, 'enqueued', v_enqueued));

  return jsonb_build_object('ok', true, 'limit', v_limit, 'enqueued', v_enqueued);
end;
$$;

create or replace function public.admin_zoho_enqueue_single_user(
  p_email text default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_user_id uuid := p_user_id;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_queue_id uuid;
begin
  if v_user_id is null and v_email <> '' then
    select au.id
    into v_user_id
    from auth.users au
    where lower(btrim(coalesce(au.email, ''))) = v_email
      and au.deleted_at is null
    order by au.created_at desc
    limit 1;
  end if;

  if v_user_id is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  v_queue_id := public.enqueue_zoho_contact_sync(v_user_id, 'manual_resync', 'admin_single_user');
  perform public.write_admin_audit(v_admin_id, v_user_id, 'zoho_single_user_enqueue', jsonb_build_object('queue_id', v_queue_id));

  return jsonb_build_object('ok', true, 'user_id', v_user_id, 'queue_id', v_queue_id);
end;
$$;

create or replace function public.admin_zoho_retry_failed()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_count integer;
begin
  update public.zoho_contact_sync_queue
  set
    status = 'pending',
    next_attempt_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null,
    processed_at = null
  where status = 'failed';

  get diagnostics v_count = row_count;
  perform public.write_admin_audit(v_admin_id, null, 'zoho_retry_failed', jsonb_build_object('count', v_count));

  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

create or replace function public.zoho_claim_pending_queue(
  p_limit integer default 25,
  p_worker_id text default 'zoho-campaigns-sync'
)
returns table (
  id uuid,
  user_id uuid,
  event_type text,
  desired_segment text,
  source text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  return query
  update public.zoho_contact_sync_queue q
  set
    status = 'processing',
    attempt_count = q.attempt_count + 1,
    locked_at = now(),
    locked_by = coalesce(nullif(btrim(p_worker_id), ''), 'zoho-campaigns-sync'),
    updated_at = now()
  where q.id in (
    select pending.id
    from public.zoho_contact_sync_queue pending
    where pending.status = 'pending'
      and pending.next_attempt_at <= now()
    order by pending.created_at
    limit v_limit
    for update skip locked
  )
  returning q.id, q.user_id, q.event_type, q.desired_segment, q.source, q.attempt_count;
end;
$$;

create or replace function public.zoho_update_profile_sync_state(
  p_user_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  perform set_config('app.allow_server_payment_update', 'true', true);
  perform set_config('app.skip_zoho_enqueue', 'true', true);

  update public.profiles
  set
    email_marketing_unsubscribed_at = case
      when p_payload ? 'email_marketing_unsubscribed_at' then nullif(p_payload ->> 'email_marketing_unsubscribed_at', '')::timestamptz
      else email_marketing_unsubscribed_at
    end,
    email_marketing_unsubscribe_source = case
      when p_payload ? 'email_marketing_unsubscribe_source' then nullif(p_payload ->> 'email_marketing_unsubscribe_source', '')
      else email_marketing_unsubscribe_source
    end,
    zoho_last_synced_at = case
      when p_payload ? 'zoho_last_synced_at' then nullif(p_payload ->> 'zoho_last_synced_at', '')::timestamptz
      else zoho_last_synced_at
    end,
    zoho_last_sync_status = case
      when p_payload ? 'zoho_last_sync_status' then nullif(p_payload ->> 'zoho_last_sync_status', '')
      else zoho_last_sync_status
    end,
    zoho_last_sync_error = case
      when p_payload ? 'zoho_last_sync_error' then nullif(p_payload ->> 'zoho_last_sync_error', '')
      else zoho_last_sync_error
    end,
    zoho_contact_status = case
      when p_payload ? 'zoho_contact_status' then nullif(p_payload ->> 'zoho_contact_status', '')
      else zoho_contact_status
    end
  where id = p_user_id;
end;
$$;

alter table public.zoho_contact_sync_queue enable row level security;
alter table public.zoho_contact_sync_logs enable row level security;
alter table public.zoho_contact_field_mappings enable row level security;

drop policy if exists "zoho queue admin select" on public.zoho_contact_sync_queue;
create policy "zoho queue admin select"
on public.zoho_contact_sync_queue for select
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists "zoho logs admin select" on public.zoho_contact_sync_logs;
create policy "zoho logs admin select"
on public.zoho_contact_sync_logs for select
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists "zoho fields admin select" on public.zoho_contact_field_mappings;
create policy "zoho fields admin select"
on public.zoho_contact_field_mappings for select
to authenticated
using (public.is_admin_user(auth.uid()));

revoke all on table public.zoho_contact_sync_queue from anon, authenticated;
revoke all on table public.zoho_contact_sync_logs from anon, authenticated;
revoke all on table public.zoho_contact_field_mappings from anon, authenticated;
grant select on table public.zoho_contact_sync_queue to authenticated;
grant select on table public.zoho_contact_sync_logs to authenticated;
grant select on table public.zoho_contact_field_mappings to authenticated;
grant all on table public.zoho_contact_sync_queue to service_role;
grant all on table public.zoho_contact_sync_logs to service_role;
grant all on table public.zoho_contact_field_mappings to service_role;

revoke all on function public.zoho_get_contact_desired_state(uuid, text) from public;
revoke all on function public.zoho_claim_pending_queue(integer, text) from public;
revoke all on function public.zoho_update_profile_sync_state(uuid, jsonb) from public;
grant execute on function public.enqueue_zoho_contact_sync(uuid, text, text) to service_role;
grant execute on function public.zoho_get_contact_desired_state(uuid, text) to service_role;
grant execute on function public.zoho_claim_pending_queue(integer, text) to service_role;
grant execute on function public.zoho_update_profile_sync_state(uuid, jsonb) to service_role;
grant execute on function public.admin_zoho_backfill_preview() to authenticated;
grant execute on function public.admin_zoho_get_dashboard() to authenticated;
grant execute on function public.admin_zoho_enqueue_backfill(integer) to authenticated;
grant execute on function public.admin_zoho_enqueue_single_user(text, uuid) to authenticated;
grant execute on function public.admin_zoho_retry_failed() to authenticated;
