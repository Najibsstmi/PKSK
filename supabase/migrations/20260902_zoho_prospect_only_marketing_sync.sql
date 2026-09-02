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
  v_is_premium boolean := false;
  v_is_blocked boolean := false;
  v_is_admin_internal boolean := false;
  v_is_valid_email boolean := false;
  v_has_prospect_plan boolean := false;
  v_marketing_eligible boolean := false;
  v_syncable boolean := false;
  v_skip_reason text;
  v_consent_status text;
  v_raw_subscription_plan text;
  v_zoho_subscription_status text;
  v_zoho_subscription_plan text;
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
  v_raw_subscription_plan := nullif(btrim(coalesce(v_profile.subscription_plan, '')), '');
  v_effective_status := public.zoho_effective_subscription_status(v_profile.subscription_status, v_profile.subscription_ends_at, v_profile.is_blocked);
  v_desired_segment := public.zoho_segment_for_status(v_effective_status);
  v_is_premium := v_desired_segment = 'premium' and public.is_premium_user(p_user_id);
  v_is_blocked := v_desired_segment = 'blocked' or coalesce(v_profile.is_blocked, false);
  v_is_admin_internal := coalesce(v_profile.role, 'user') in ('admin', 'super_admin');
  v_is_valid_email := v_email is not null and v_email <> '' and public.is_valid_email(v_email);
  v_has_prospect_plan := coalesce(v_raw_subscription_plan, 'prospect') in ('prospect', 'free');

  v_zoho_subscription_status := case
    when v_desired_segment = 'prospect' then 'prospect'
    when v_desired_segment = 'premium' then 'premium'
    when v_desired_segment = 'expired' then 'expired'
    when v_desired_segment = 'blocked' then 'blocked'
    else 'skipped'
  end;
  v_zoho_subscription_plan := case
    when v_desired_segment = 'prospect' then 'prospect'
    when v_desired_segment = 'premium' then 'premium'
    when v_desired_segment = 'expired' then coalesce(v_raw_subscription_plan, 'expired')
    when v_desired_segment = 'blocked' then coalesce(v_raw_subscription_plan, 'blocked')
    else coalesce(v_raw_subscription_plan, '')
  end;

  v_marketing_eligible := v_desired_segment = 'prospect'
    and coalesce(v_profile.subscription_status, 'free') = 'free'
    and v_has_prospect_plan
    and not v_is_premium
    and not v_is_blocked
    and not v_is_admin_internal
    and v_auth_deleted_at is null
    and v_is_valid_email
    and v_consent_status = 'true'
    and v_profile.email_marketing_unsubscribed_at is null;

  v_syncable := v_marketing_eligible
    or (
      v_desired_segment = 'premium'
      and v_is_premium
      and not v_is_blocked
      and not v_is_admin_internal
      and v_auth_deleted_at is null
      and v_is_valid_email
      and v_profile.email_marketing_unsubscribed_at is null
    )
    or (
      v_desired_segment = 'blocked'
      and not v_is_admin_internal
      and v_auth_deleted_at is null
      and v_is_valid_email
    );

  if v_email is null or v_email = '' then
    v_skip_reason := 'EMAIL_MISSING';
  elsif not v_is_valid_email then
    v_skip_reason := 'INVALID_EMAIL';
  elsif v_auth_deleted_at is not null then
    v_skip_reason := 'DELETED_USER';
  elsif v_is_admin_internal then
    v_skip_reason := 'ADMIN_EXCLUDED';
  elsif v_effective_status = 'skipped' then
    v_skip_reason := 'UNKNOWN_SUBSCRIPTION_STATUS';
  elsif v_is_blocked then
    v_skip_reason := 'BLOCKED';
  elsif v_profile.email_marketing_unsubscribed_at is not null then
    v_skip_reason := 'UNSUBSCRIBED';
  elsif v_desired_segment = 'premium' or v_is_premium then
    v_skip_reason := 'NO_LONGER_PROSPECT';
  elsif v_desired_segment = 'expired' then
    v_skip_reason := 'EXPIRED_NOT_PROSPECT';
  elsif v_desired_segment <> 'prospect' then
    v_skip_reason := 'NOT_PROSPECT';
  elsif coalesce(v_profile.subscription_status, '') <> 'free' or not v_has_prospect_plan then
    v_skip_reason := 'NOT_PROSPECT_PLAN';
  elsif v_consent_status = 'missing' then
    v_skip_reason := 'MARKETING_CONSENT_MISSING';
  elsif v_consent_status = 'declined' then
    v_skip_reason := 'MARKETING_CONSENT_DECLINED';
  elsif v_consent_status <> 'true' then
    v_skip_reason := 'MARKETING_CONSENT_NOT_CONFIRMED';
  end if;

  return jsonb_build_object(
    'syncable', v_syncable,
    'skip_reason', v_skip_reason,
    'user_id', p_user_id,
    'email', v_email,
    'email_masked', public.mask_email(v_email),
    'full_name', v_full_name,
    'display_name', v_display_name,
    'first_name', v_first_name,
    'last_name', v_last_name,
    'role', v_profile.role,
    'profile_subscription_status', v_profile.subscription_status,
    'profile_subscription_plan', v_raw_subscription_plan,
    'subscription_status', v_zoho_subscription_status,
    'subscription_plan', v_zoho_subscription_plan,
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
      lower(btrim(coalesce(au.email, ''))) as email,
      au.deleted_at,
      p.id is not null as has_profile,
      coalesce(p.role, 'user') as role,
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
      p.subscription_status,
      nullif(btrim(coalesce(p.subscription_plan, '')), '') as subscription_plan,
      public.zoho_effective_subscription_status(p.subscription_status, p.subscription_ends_at, p.is_blocked) as effective_status
    from auth.users au
    left join public.profiles p on p.id = au.id
  ),
  enriched as (
    select
      *,
      public.is_valid_email(email) as valid_email,
      public.zoho_segment_for_status(effective_status) as desired_segment,
      role in ('admin', 'super_admin') as is_admin_internal
    from users_base
  ),
  flags as (
    select
      *,
      has_profile
        and deleted_at is null
        and not is_admin_internal
        and desired_segment = 'prospect' as is_prospect,
      has_profile
        and deleted_at is null
        and not is_admin_internal
        and desired_segment = 'prospect'
        and coalesce(is_blocked, false) = false
        and valid_email
        and marketing_consent = true
        and marketing_consent_status = 'true'
        and email_marketing_unsubscribed_at is null
        and coalesce(subscription_status, 'free') = 'free'
        and coalesce(subscription_plan, 'prospect') in ('prospect', 'free') as is_prospect_eligible
    from enriched
  )
  select jsonb_build_object(
    'total_auth_users', count(*)::integer,
    'with_profile', count(*) filter (where has_profile)::integer,
    'missing_profile', count(*) filter (where not has_profile)::integer,
    'total_prospects', count(*) filter (where is_prospect)::integer,
    'prospects', count(*) filter (where is_prospect)::integer,
    'prospects_with_consent', count(*) filter (where is_prospect and marketing_consent_status = 'true')::integer,
    'prospects_eligible', count(*) filter (where is_prospect_eligible)::integer,
    'eligible_users', count(*) filter (where is_prospect_eligible)::integer,
    'premium_excluded', count(*) filter (where has_profile and deleted_at is null and not is_admin_internal and desired_segment = 'premium')::integer,
    'premium', count(*) filter (where has_profile and deleted_at is null and not is_admin_internal and desired_segment = 'premium')::integer,
    'expired', count(*) filter (where has_profile and deleted_at is null and not is_admin_internal and desired_segment = 'expired')::integer,
    'blocked', count(*) filter (where has_profile and deleted_at is null and (desired_segment = 'blocked' or is_blocked = true))::integer,
    'blocked_users', count(*) filter (where has_profile and deleted_at is null and (desired_segment = 'blocked' or is_blocked = true))::integer,
    'invalid_email', count(*) filter (where has_profile and deleted_at is null and not is_admin_internal and not valid_email)::integer,
    'deleted_users', count(*) filter (where deleted_at is not null)::integer,
    'admin_internal_excluded', count(*) filter (where has_profile and deleted_at is null and is_admin_internal)::integer,
    'admin_excluded', count(*) filter (where has_profile and deleted_at is null and is_admin_internal)::integer,
    'marketing_consent_true', count(*) filter (where is_prospect and marketing_consent_status = 'true')::integer,
    'marketing_consent_missing', count(*) filter (where is_prospect and marketing_consent_status = 'missing')::integer,
    'marketing_consent_declined', count(*) filter (where is_prospect and marketing_consent_status = 'declined')::integer,
    'marketing_consent_false_or_unknown', count(*) filter (where is_prospect and marketing_consent_status in ('missing', 'declined'))::integer,
    'consent_missing', count(*) filter (where is_prospect and marketing_consent_status = 'missing')::integer,
    'consent_declined', count(*) filter (where is_prospect and marketing_consent_status = 'declined')::integer,
    'unsubscribed', count(*) filter (where is_prospect and marketing_consent_status = 'unsubscribed')::integer,
    'not_confirmed_for_marketing', count(*) filter (
      where is_prospect
        and marketing_consent_status in ('missing', 'declined')
        and email_marketing_unsubscribed_at is null
    )::integer
  )
  into v_payload
  from flags;

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
      and coalesce(p.role, 'user') not in ('admin', 'super_admin')
      and coalesce(p.is_blocked, false) = false
      and public.is_valid_email(au.email::text)
      and public.marketing_consent_status(
        p.marketing_consent,
        p.marketing_consent_decided_at,
        p.marketing_consent_at,
        p.marketing_consent_revoked_at,
        p.email_marketing_unsubscribed_at
      ) = 'true'
      and p.email_marketing_unsubscribed_at is null
      and public.zoho_segment_for_status(public.zoho_effective_subscription_status(p.subscription_status, p.subscription_ends_at, p.is_blocked)) = 'prospect'
      and coalesce(p.subscription_status, 'free') = 'free'
      and coalesce(nullif(btrim(coalesce(p.subscription_plan, '')), ''), 'prospect') in ('prospect', 'free')
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

create or replace function public.admin_zoho_retry_failed()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_item public.zoho_contact_sync_queue%rowtype;
  v_state jsonb;
  v_reason text;
  v_has_active_queue boolean;
  v_evaluated integer := 0;
  v_retried integer := 0;
  v_skipped integer := 0;
  v_duplicates integer := 0;
  v_updated integer := 0;
begin
  for v_item in
    select *
    from public.zoho_contact_sync_queue
    where status = 'failed'
    order by created_at
  loop
    v_evaluated := v_evaluated + 1;
    v_state := public.zoho_get_contact_desired_state(v_item.user_id, coalesce(v_item.source, v_item.event_type, 'retry_failed'));
    v_reason := case
      when coalesce((v_state ->> 'marketing_eligible')::boolean, false) = true
        and v_state ->> 'desired_segment' = 'prospect' then null
      when v_state ->> 'desired_segment' = 'premium'
        or coalesce((v_state ->> 'is_premium')::boolean, false) = true then 'NO_LONGER_PROSPECT'
      when nullif(v_state ->> 'skip_reason', '') is not null then v_state ->> 'skip_reason'
      when v_state ->> 'desired_segment' = 'expired' then 'EXPIRED_NOT_PROSPECT'
      else 'NOT_ELIGIBLE_FOR_PROSPECT_MARKETING'
    end;

    if v_reason is not null then
      update public.zoho_contact_sync_queue
      set
        status = 'skipped',
        desired_segment = coalesce(v_state ->> 'desired_segment', desired_segment),
        next_attempt_at = now(),
        locked_at = null,
        locked_by = null,
        last_error = v_reason,
        last_response = jsonb_build_object(
          'reason', v_reason,
          'email_masked', v_state ->> 'email_masked',
          'desired_segment', v_state ->> 'desired_segment',
          'marketing_eligible', coalesce((v_state ->> 'marketing_eligible')::boolean, false)
        ),
        processed_at = now()
      where id = v_item.id;

      perform public.zoho_update_profile_sync_state(v_item.user_id, jsonb_build_object(
        'zoho_last_synced_at', now(),
        'zoho_last_sync_status', 'skipped',
        'zoho_last_sync_error', v_reason,
        'zoho_contact_status', 'skipped'
      ));
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select exists (
      select 1
      from public.zoho_contact_sync_queue active_queue
      where active_queue.user_id = v_item.user_id
        and active_queue.id <> v_item.id
        and active_queue.status in ('pending', 'processing')
    )
    into v_has_active_queue;

    if v_has_active_queue then
      update public.zoho_contact_sync_queue
      set
        status = 'skipped',
        desired_segment = 'prospect',
        next_attempt_at = now(),
        locked_at = null,
        locked_by = null,
        last_error = 'DUPLICATE_ACTIVE_QUEUE_EXISTS',
        last_response = jsonb_build_object(
          'reason', 'DUPLICATE_ACTIVE_QUEUE_EXISTS',
          'email_masked', v_state ->> 'email_masked',
          'desired_segment', v_state ->> 'desired_segment',
          'marketing_eligible', true
        ),
        processed_at = now()
      where id = v_item.id;
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    begin
      update public.zoho_contact_sync_queue
      set
        status = 'pending',
        event_type = 'manual_resync',
        desired_segment = 'prospect',
        source = 'retry_failed',
        next_attempt_at = now(),
        locked_at = null,
        locked_by = null,
        last_error = null,
        last_response = '{}'::jsonb,
        processed_at = null
      where id = v_item.id
        and status = 'failed';
      get diagnostics v_updated = row_count;
      if v_updated > 0 then
        v_retried := v_retried + 1;
      end if;
    exception
      when unique_violation then
        update public.zoho_contact_sync_queue
        set
          status = 'skipped',
          desired_segment = 'prospect',
          next_attempt_at = now(),
          locked_at = null,
          locked_by = null,
          last_error = 'DUPLICATE_PENDING_EXISTS',
          last_response = jsonb_build_object(
            'reason', 'DUPLICATE_PENDING_EXISTS',
            'email_masked', v_state ->> 'email_masked',
            'desired_segment', v_state ->> 'desired_segment',
            'marketing_eligible', true
          ),
          processed_at = now()
        where id = v_item.id;
        v_duplicates := v_duplicates + 1;
    end;
  end loop;

  perform public.write_admin_audit(v_admin_id, null, 'zoho_retry_failed', jsonb_build_object(
    'evaluated', v_evaluated,
    'retried', v_retried,
    'skipped', v_skipped,
    'duplicates', v_duplicates
  ));

  return jsonb_build_object(
    'ok', true,
    'count', v_retried,
    'evaluated', v_evaluated,
    'retried', v_retried,
    'skipped', v_skipped,
    'duplicates', v_duplicates
  );
end;
$$;

grant execute on function public.marketing_consent_status(boolean, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.zoho_get_contact_desired_state(uuid, text) to service_role;
grant execute on function public.admin_zoho_backfill_preview() to authenticated;
grant execute on function public.admin_zoho_enqueue_backfill(integer) to authenticated;
grant execute on function public.admin_zoho_retry_failed() to authenticated;
