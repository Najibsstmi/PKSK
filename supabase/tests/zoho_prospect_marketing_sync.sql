begin;

do $$
declare
  v_admin uuid := '00000000-0000-0000-0000-000000000001';
  v_prospect_true uuid := '00000000-0000-0000-0000-000000000101';
  v_consent_missing uuid := '00000000-0000-0000-0000-000000000102';
  v_consent_declined uuid := '00000000-0000-0000-0000-000000000103';
  v_unsubscribed uuid := '00000000-0000-0000-0000-000000000104';
  v_premium uuid := '00000000-0000-0000-0000-000000000105';
  v_retry uuid := '00000000-0000-0000-0000-000000000106';
  v_ids uuid[] := array[
    v_admin,
    v_prospect_true,
    v_consent_missing,
    v_consent_declined,
    v_unsubscribed,
    v_premium,
    v_retry
  ];
begin
  perform set_config('app.allow_server_payment_update', 'true', true);
  perform set_config('app.skip_zoho_enqueue', 'true', true);

  delete from public.zoho_contact_sync_logs where user_id = any(v_ids);
  delete from public.zoho_contact_sync_queue where user_id = any(v_ids);
  delete from public.profiles where id = any(v_ids);
  delete from auth.users where id = any(v_ids);

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  select
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    email,
    'test-password-hash',
    now(),
    '{}'::jsonb,
    jsonb_build_object('display_name', display_name),
    now(),
    now()
  from (values
    (v_admin, 'admin.zoho@example.com', 'Admin Zoho'),
    (v_prospect_true, 'prospect.true@example.com', 'Prospect True'),
    (v_consent_missing, 'prospect.missing@example.com', 'Prospect Missing'),
    (v_consent_declined, 'prospect.declined@example.com', 'Prospect Declined'),
    (v_unsubscribed, 'prospect.unsubscribed@example.com', 'Prospect Unsubscribed'),
    (v_premium, 'premium.true@example.com', 'Premium True'),
    (v_retry, 'prospect.retry@example.com', 'Prospect Retry')
  ) as users(user_id, email, display_name);

  insert into public.profiles (
    id,
    display_name,
    role,
    subscription_status,
    subscription_plan,
    subscription_started_at,
    subscription_ends_at,
    is_blocked,
    marketing_consent,
    marketing_consent_at,
    marketing_consent_source,
    marketing_consent_revoked_at,
    marketing_consent_decided_at,
    marketing_consent_decision_source,
    email_marketing_unsubscribed_at
  )
  values
    (v_admin, 'Admin Zoho', 'admin', 'premium', 'lifetime', now(), null, false, false, null, null, null, null, null, null),
    (v_prospect_true, 'Prospect True', 'user', 'free', null, null, null, false, true, now(), 'test', null, now(), 'test', null),
    (v_consent_missing, 'Prospect Missing', 'user', 'free', null, null, null, false, false, null, null, null, null, null, null),
    (v_consent_declined, 'Prospect Declined', 'user', 'free', null, null, null, false, false, null, 'test', now(), now(), 'test', null),
    (v_unsubscribed, 'Prospect Unsubscribed', 'user', 'free', null, null, null, false, true, now(), 'test', null, now(), 'test', now()),
    (v_premium, 'Premium True', 'user', 'premium', 'lifetime', now(), null, false, true, now(), 'test', null, now(), 'test', null),
    (v_retry, 'Prospect Retry', 'user', 'free', null, null, null, false, true, now(), 'test', null, now(), 'test', null)
  on conflict (id) do update
  set
    display_name = excluded.display_name,
    role = excluded.role,
    subscription_status = excluded.subscription_status,
    subscription_plan = excluded.subscription_plan,
    subscription_started_at = excluded.subscription_started_at,
    subscription_ends_at = excluded.subscription_ends_at,
    is_blocked = excluded.is_blocked,
    marketing_consent = excluded.marketing_consent,
    marketing_consent_at = excluded.marketing_consent_at,
    marketing_consent_source = excluded.marketing_consent_source,
    marketing_consent_revoked_at = excluded.marketing_consent_revoked_at,
    marketing_consent_decided_at = excluded.marketing_consent_decided_at,
    marketing_consent_decision_source = excluded.marketing_consent_decision_source,
    email_marketing_unsubscribed_at = excluded.email_marketing_unsubscribed_at;

  delete from public.zoho_contact_sync_logs where user_id = any(v_ids);
  delete from public.zoho_contact_sync_queue where user_id = any(v_ids);
  perform set_config('app.skip_zoho_enqueue', 'false', true);
end;
$$;

select plan(25);

select ok(
  coalesce((public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000101', 'test') ->> 'marketing_eligible')::boolean, false),
  'A prospect with consent true is eligible'
);
select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000101', 'test') ->> 'subscription_status', 'prospect', 'A prospect sends Subscription Status prospect');
select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000101', 'test') ->> 'subscription_plan', 'prospect', 'A prospect sends Subscription Plan prospect');
select ok(
  coalesce((public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000101', 'test') ->> 'is_premium')::boolean, true) = false,
  'A prospect sends Is Premium false'
);
select ok(public.enqueue_zoho_contact_sync('00000000-0000-0000-0000-000000000101', 'backfill', 'test') is not null, 'A prospect can be enqueued');

select ok(
  coalesce((public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000102', 'test') ->> 'marketing_eligible')::boolean, true) = false,
  'B prospect with missing consent is not eligible'
);
select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000102', 'test') ->> 'skip_reason', 'MARKETING_CONSENT_MISSING', 'B missing consent reason is explicit');

select ok(
  coalesce((public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000103', 'test') ->> 'marketing_eligible')::boolean, true) = false,
  'C prospect with declined consent is not eligible'
);
select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000103', 'test') ->> 'skip_reason', 'MARKETING_CONSENT_DECLINED', 'C declined consent reason is explicit');

select ok(
  coalesce((public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000104', 'test') ->> 'marketing_eligible')::boolean, true) = false,
  'D unsubscribed prospect is not eligible'
);
select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000104', 'test') ->> 'skip_reason', 'UNSUBSCRIBED', 'D unsubscribed reason is explicit');

select ok(
  coalesce((public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000105', 'test') ->> 'marketing_eligible')::boolean, true) = false,
  'E premium user with consent true is not prospect-marketing eligible'
);
select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000105', 'test') ->> 'desired_segment', 'premium', 'E premium user desired segment is premium');
select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000105', 'test') ->> 'subscription_status', 'premium', 'E premium sends Subscription Status premium');
select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000105', 'test') ->> 'subscription_plan', 'premium', 'E premium sends Subscription Plan premium');
select ok(
  coalesce((public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000105', 'test') ->> 'is_premium')::boolean, false),
  'E premium sends Is Premium true'
);
select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000105', 'test') ->> 'skip_reason', 'NO_LONGER_PROSPECT', 'E premium is marked no longer prospect for prospect marketing');

do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
end $$;
select is((public.admin_zoho_backfill_preview() ->> 'prospects_eligible')::integer, 2, 'Preview counts only eligible prospects');
select ok((public.admin_zoho_backfill_preview() ->> 'premium_excluded')::integer >= 1, 'Preview exposes premium excluded count');

update public.profiles
set
  subscription_status = 'premium',
  subscription_plan = 'lifetime',
  subscription_started_at = now(),
  subscription_ends_at = null
where id = '00000000-0000-0000-0000-000000000101';

select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000101', 'subscription_changed') ->> 'desired_segment', 'premium', 'F upgraded prospect desired segment becomes premium');
select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000101', 'subscription_changed') ->> 'subscription_status', 'premium', 'F upgraded prospect sends Subscription Status premium');
select is(public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000101', 'subscription_changed') ->> 'subscription_plan', 'premium', 'F upgraded prospect sends Subscription Plan premium');
select ok(
  coalesce((public.zoho_get_contact_desired_state('00000000-0000-0000-0000-000000000101', 'subscription_changed') ->> 'is_premium')::boolean, false),
  'F upgraded prospect sends Is Premium true'
);

create temporary table zoho_test_failed_queue (id uuid) on commit drop;

insert into public.zoho_contact_sync_queue (user_id, event_type, desired_segment, source, status)
values ('00000000-0000-0000-0000-000000000106', 'backfill', 'prospect', 'test', 'pending');

with inserted as (
  insert into public.zoho_contact_sync_queue (user_id, event_type, desired_segment, source, status, last_error, processed_at)
  values ('00000000-0000-0000-0000-000000000106', 'backfill', 'prospect', 'test', 'failed', 'prior failure', now())
  returning id
)
insert into zoho_test_failed_queue
select id from inserted;

create temporary table zoho_test_retry_result (result jsonb) on commit drop;
insert into zoho_test_retry_result
select public.admin_zoho_retry_failed();

select ok((select (result ->> 'duplicates')::integer from zoho_test_retry_result) >= 1, 'G retry skips duplicate active queue without duplicate-key error');
select ok(
  exists (
    select 1
    from public.zoho_contact_sync_queue
    where id = (select id from zoho_test_failed_queue)
      and status = 'skipped'
      and last_error = 'DUPLICATE_ACTIVE_QUEUE_EXISTS'
  ),
  'G duplicate failed row is marked skipped'
);

select * from finish();

rollback;
