alter table public.profiles add column if not exists marketing_consent_decided_at timestamptz;
alter table public.profiles add column if not exists marketing_consent_decision_source text;

create index if not exists idx_profiles_marketing_consent_decision
on public.profiles (marketing_consent, marketing_consent_decided_at, email_marketing_unsubscribed_at);

update public.profiles
set
  marketing_consent_decided_at = coalesce(marketing_consent_decided_at, marketing_consent_at, created_at),
  marketing_consent_decision_source = coalesce(marketing_consent_decision_source, marketing_consent_source, 'existing_consent')
where marketing_consent = true
  and marketing_consent_decided_at is null;

update public.profiles
set
  marketing_consent_decided_at = coalesce(marketing_consent_decided_at, marketing_consent_revoked_at, updated_at),
  marketing_consent_decision_source = coalesce(marketing_consent_decision_source, marketing_consent_source, 'existing_decline')
where marketing_consent = false
  and marketing_consent_decided_at is null
  and marketing_consent_revoked_at is not null;

update public.profiles p
set
  marketing_consent_decided_at = coalesce(p.marketing_consent_decided_at, p.created_at),
  marketing_consent_decision_source = coalesce(
    p.marketing_consent_decision_source,
    nullif(auth_user.raw_user_meta_data ->> 'marketing_consent_source', ''),
    'signup'
  ),
  marketing_consent_source = coalesce(
    p.marketing_consent_source,
    nullif(auth_user.raw_user_meta_data ->> 'marketing_consent_source', ''),
    'signup'
  ),
  marketing_consent_revoked_at = coalesce(p.marketing_consent_revoked_at, p.created_at)
from auth.users auth_user
where auth_user.id = p.id
  and p.marketing_consent = false
  and p.marketing_consent_decided_at is null
  and p.marketing_consent_at is null
  and p.marketing_consent_revoked_at is null
  and auth_user.raw_user_meta_data ? 'marketing_consent';

create or replace function public.marketing_consent_status(
  p_marketing_consent boolean,
  p_marketing_consent_decided_at timestamptz,
  p_marketing_consent_at timestamptz,
  p_marketing_consent_revoked_at timestamptz,
  p_email_marketing_unsubscribed_at timestamptz
)
returns text
language sql
stable
as $$
  select case
    when p_email_marketing_unsubscribed_at is not null then 'unsubscribed'
    when coalesce(p_marketing_consent, false) = true then 'true'
    when p_marketing_consent_decided_at is null
      and p_marketing_consent_at is null
      and p_marketing_consent_revoked_at is null then 'missing'
    else 'declined'
  end;
$$;

create or replace function public.record_marketing_consent_decision(
  p_consent boolean,
  p_source text default 'legacy_login_prompt'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source text := coalesce(nullif(btrim(p_source), ''), 'legacy_login_prompt');
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if v_profile.id is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  update public.profiles
  set
    marketing_consent = coalesce(p_consent, false),
    marketing_consent_decided_at = now(),
    marketing_consent_decision_source = v_source,
    marketing_consent_at = case when coalesce(p_consent, false) then now() else null end,
    marketing_consent_source = v_source,
    marketing_consent_revoked_at = case when coalesce(p_consent, false) then null else now() end
  where id = v_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marketing_consent boolean := lower(coalesce(new.raw_user_meta_data ->> 'marketing_consent', 'false')) in ('true', '1', 'yes');
  v_has_marketing_decision boolean := new.raw_user_meta_data ? 'marketing_consent';
  v_decision_source text := coalesce(nullif(new.raw_user_meta_data ->> 'marketing_consent_source', ''), 'signup');
begin
  insert into public.profiles (
    id,
    display_name,
    marketing_consent,
    marketing_consent_at,
    marketing_consent_source,
    marketing_consent_revoked_at,
    marketing_consent_decided_at,
    marketing_consent_decision_source
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    v_marketing_consent,
    case when v_marketing_consent then now() else null end,
    case when v_has_marketing_decision then v_decision_source else null end,
    case when v_has_marketing_decision and not v_marketing_consent then now() else null end,
    case when v_has_marketing_decision then now() else null end,
    case when v_has_marketing_decision then v_decision_source else null end
  )
  on conflict (id) do nothing;

  begin
    perform public.enqueue_zoho_contact_sync(new.id, 'user_registered', 'signup');
  exception when others then
    null;
  end;

  return new;
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
  v_consent_status text;
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

  v_consent_status := public.marketing_consent_status(
    v_profile.marketing_consent,
    v_profile.marketing_consent_decided_at,
    v_profile.marketing_consent_at,
    v_profile.marketing_consent_revoked_at,
    v_profile.email_marketing_unsubscribed_at
  );
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
  v_marketing_eligible := v_consent_status = 'true'
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
  elsif v_consent_status = 'missing' then
    v_skip_reason := 'MARKETING_CONSENT_MISSING';
  elsif v_consent_status = 'declined' then
    v_skip_reason := 'MARKETING_CONSENT_DECLINED';
  elsif v_consent_status <> 'true' then
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
    'marketing_consent_status', v_consent_status,
    'marketing_consent_at', v_profile.marketing_consent_at,
    'marketing_consent_source', v_profile.marketing_consent_source,
    'marketing_consent_decided_at', v_profile.marketing_consent_decided_at,
    'marketing_consent_decision_source', v_profile.marketing_consent_decision_source,
    'email_marketing_unsubscribed_at', v_profile.email_marketing_unsubscribed_at,
    'marketing_eligible', v_marketing_eligible,
    'desired_segment', v_desired_segment,
    'source', coalesce(nullif(btrim(p_source), ''), 'manual_resync'),
    'last_synced_at', now()
  );
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
  with users_base as (
    select
      au.id,
      au.email::text as email,
      au.created_at as auth_created_at,
      au.updated_at as auth_updated_at,
      au.deleted_at,
      p.id is not null as has_profile,
      p.role,
      coalesce(p.is_blocked, false) as is_blocked,
      coalesce(p.marketing_consent, false) as marketing_consent,
      public.marketing_consent_status(
        p.marketing_consent,
        p.marketing_consent_decided_at,
        p.marketing_consent_at,
        p.marketing_consent_revoked_at,
        p.email_marketing_unsubscribed_at
      ) as marketing_consent_status,
      p.email_marketing_unsubscribed_at,
      public.zoho_effective_subscription_status(p.subscription_status, p.subscription_ends_at, p.is_blocked) as effective_status
    from auth.users au
    left join public.profiles p on p.id = au.id
  ),
  enriched as (
    select
      *,
      public.zoho_segment_for_status(effective_status) as desired_segment
    from users_base
  )
  select jsonb_build_object(
    'total_auth_users', count(*)::integer,
    'with_profile', count(*) filter (where has_profile)::integer,
    'missing_profile', count(*) filter (where not has_profile)::integer,
    'eligible_users', count(*) filter (
      where has_profile
        and deleted_at is null
        and coalesce(role, 'user') not in ('admin', 'super_admin')
        and is_blocked = false
        and marketing_consent = true
        and marketing_consent_status = 'true'
        and email_marketing_unsubscribed_at is null
        and public.is_valid_email(email)
        and desired_segment in ('prospect', 'premium', 'expired')
    )::integer,
    'prospects', count(*) filter (where desired_segment = 'prospect' and has_profile)::integer,
    'premium', count(*) filter (where desired_segment = 'premium' and has_profile)::integer,
    'expired', count(*) filter (where desired_segment = 'expired' and has_profile)::integer,
    'blocked', count(*) filter (where desired_segment = 'blocked' and has_profile)::integer,
    'invalid_email', count(*) filter (where not public.is_valid_email(email))::integer,
    'deleted_users', count(*) filter (where deleted_at is not null)::integer,
    'admin_internal_excluded', count(*) filter (where role in ('admin', 'super_admin'))::integer,
    'marketing_consent_true', count(*) filter (where marketing_consent_status = 'true' and has_profile)::integer,
    'marketing_consent_missing', count(*) filter (where marketing_consent_status = 'missing' and has_profile)::integer,
    'marketing_consent_declined', count(*) filter (where marketing_consent_status = 'declined' and has_profile)::integer,
    'marketing_consent_false_or_unknown', count(*) filter (where marketing_consent_status in ('missing', 'declined') and has_profile)::integer,
    'unsubscribed', count(*) filter (where marketing_consent_status = 'unsubscribed' and has_profile)::integer,
    'not_confirmed_for_marketing', count(*) filter (
      where has_profile
        and marketing_consent_status in ('missing', 'declined')
        and email_marketing_unsubscribed_at is null
    )::integer
  )
  into v_payload
  from enriched;

  return v_payload;
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
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_enqueued integer := 0;
  v_queue_id uuid;
  v_user record;
begin
  for v_user in
    select p.id
    from public.profiles p
    join auth.users au on au.id = p.id
    where au.deleted_at is null
      and p.role not in ('admin', 'super_admin')
      and coalesce(p.is_blocked, false) = false
      and public.is_valid_email(au.email::text)
      and public.marketing_consent_status(
        p.marketing_consent,
        p.marketing_consent_decided_at,
        p.marketing_consent_at,
        p.marketing_consent_revoked_at,
        p.email_marketing_unsubscribed_at
      ) = 'true'
      and public.zoho_segment_for_status(public.zoho_effective_subscription_status(p.subscription_status, p.subscription_ends_at, p.is_blocked)) in ('prospect', 'premium', 'expired')
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

  return jsonb_build_object('ok', true, 'limit', v_limit, 'enqueued', v_enqueued, 'preview', public.admin_zoho_backfill_preview());
end;
$$;

grant execute on function public.marketing_consent_status(boolean, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.record_marketing_consent_decision(boolean, text) to authenticated;
grant execute on function public.zoho_get_contact_desired_state(uuid, text) to service_role;
grant execute on function public.admin_zoho_backfill_preview() to authenticated;
grant execute on function public.admin_zoho_enqueue_backfill(integer) to authenticated;
