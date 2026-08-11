alter table public.payment_requests add column if not exists payment_method text not null default 'manual_qr';
alter table public.payment_requests add column if not exists currency text not null default 'MYR';
alter table public.payment_requests add column if not exists provider_bill_code text;
alter table public.payment_requests add column if not exists provider_reference text;
alter table public.payment_requests add column if not exists external_reference text;
alter table public.payment_requests add column if not exists paid_at timestamptz;
alter table public.payment_requests add column if not exists provider_response jsonb not null default '{}'::jsonb;

alter table public.payment_requests drop constraint if exists payment_requests_status_check;
alter table public.payment_requests
  add constraint payment_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired', 'paid', 'failed', 'cancelled'));

update public.payment_requests
set
  payment_method = coalesce(nullif(payment_method, ''), 'manual_qr'),
  provider = case
    when provider in ('manual_whatsapp', 'manual_qr') then 'manual_qr'
    else provider
  end,
  currency = coalesce(nullif(currency, ''), 'MYR'),
  provider_response = coalesce(provider_response, '{}'::jsonb)
where true;

create index if not exists idx_payment_requests_provider_bill_code on public.payment_requests (provider_bill_code);
create index if not exists idx_payment_requests_external_reference on public.payment_requests (external_reference);
create index if not exists idx_payment_requests_method_status on public.payment_requests (payment_method, status, created_at desc);

insert into public.app_settings (key, value, description)
values
  ('payment_provider', '"manual_qr_plus_toyyibpay"'::jsonb, 'Provider bayaran aktif. ToyyibPay automatik dan QR DuitNow manual dikekalkan.'),
  ('payment_price', '49'::jsonb, 'Harga Premium PKSK Academy.'),
  ('payment_currency', '"MYR"'::jsonb, 'Mata wang bayaran Premium.')
on conflict (key) do update
set
  value = excluded.value,
  description = excluded.description;

create or replace function public.create_manual_payment_request(p_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_amount numeric(10,2);
  v_request_id uuid;
begin
  select coalesce((value #>> '{}')::numeric, 49.00)
  into v_amount
  from public.app_settings
  where key = 'payment_price';

  v_amount := coalesce(v_amount, 49.00);
  v_email := nullif(btrim(coalesce(p_email, '')), '');

  if v_user_id is not null and v_email is null then
    select email into v_email
    from auth.users
    where id = v_user_id;
  end if;

  insert into public.payment_requests (user_id, email, amount, currency, status, provider, payment_method, notes)
  values (v_user_id, v_email, v_amount, 'MYR', 'pending', 'manual_qr', 'manual_qr', 'DuitNow QR + WhatsApp MVP')
  returning id into v_request_id;

  return jsonb_build_object(
    'id', v_request_id,
    'user_id', v_user_id,
    'email', v_email,
    'amount', v_amount,
    'currency', 'MYR',
    'status', 'pending',
    'provider', 'manual_qr',
    'payment_method', 'manual_qr'
  );
end;
$$;

create or replace function public.get_my_pending_payment_request()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_payload jsonb;
begin
  if v_user_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', pr.id,
    'user_id', pr.user_id,
    'email', pr.email,
    'amount', pr.amount,
    'currency', pr.currency,
    'status', pr.status,
    'provider', pr.provider,
    'payment_method', pr.payment_method,
    'provider_bill_code', pr.provider_bill_code,
    'provider_reference', pr.provider_reference,
    'external_reference', pr.external_reference,
    'paid_at', pr.paid_at,
    'provider_response', pr.provider_response,
    'notes', pr.notes,
    'created_at', pr.created_at,
    'updated_at', pr.updated_at
  )
  into v_payload
  from public.payment_requests pr
  where pr.user_id = v_user_id
    and pr.status = 'pending'
  order by pr.created_at desc
  limit 1;

  return v_payload;
end;
$$;

create or replace function public.get_my_latest_payment_request()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_payload jsonb;
begin
  if v_user_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', pr.id,
    'user_id', pr.user_id,
    'email', pr.email,
    'amount', pr.amount,
    'currency', pr.currency,
    'status', pr.status,
    'provider', pr.provider,
    'payment_method', pr.payment_method,
    'provider_bill_code', pr.provider_bill_code,
    'provider_reference', pr.provider_reference,
    'external_reference', pr.external_reference,
    'paid_at', pr.paid_at,
    'provider_response', pr.provider_response,
    'notes', pr.notes,
    'created_at', pr.created_at,
    'updated_at', pr.updated_at
  )
  into v_payload
  from public.payment_requests pr
  where pr.user_id = v_user_id
  order by pr.created_at desc
  limit 1;

  return v_payload;
end;
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
  if coalesce(current_setting('app.allow_server_payment_update', true), '') = 'true' then
    return new;
  end if;

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

create or replace function public.activate_toyyibpay_premium(
  p_payment_request_id uuid,
  p_provider_reference text,
  p_provider_bill_code text,
  p_provider_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.payment_requests%rowtype;
  v_previous_status text;
  v_paid_at timestamptz := now();
begin
  select *
  into v_request
  from public.payment_requests
  where id = p_payment_request_id
  for update;

  if v_request.id is null then
    raise exception 'PAYMENT_REQUEST_NOT_FOUND';
  end if;

  if v_request.payment_method <> 'toyyibpay' or v_request.provider <> 'toyyibpay' then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if v_request.amount <> 49.00 then
    raise exception 'INVALID_PAYMENT_AMOUNT';
  end if;

  if v_request.status in ('paid', 'approved') then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', v_request.status);
  end if;

  if v_request.user_id is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  select subscription_status
  into v_previous_status
  from public.profiles
  where id = v_request.user_id
  for update;

  if v_previous_status is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.payment_requests
  set
    status = 'paid',
    provider_reference = nullif(btrim(coalesce(p_provider_reference, '')), ''),
    provider_bill_code = coalesce(nullif(btrim(coalesce(p_provider_bill_code, '')), ''), provider_bill_code),
    paid_at = v_paid_at,
    provider_response = coalesce(p_provider_response, '{}'::jsonb),
    notes = 'ToyyibPay payment successful'
  where id = p_payment_request_id;

  perform set_config('app.allow_server_payment_update', 'true', true);

  update public.profiles
  set
    subscription_status = 'premium',
    subscription_plan = 'lifetime',
    subscription_started_at = v_paid_at,
    subscription_ends_at = null,
    access_granted_at = v_paid_at
  where id = v_request.user_id;

  perform public.write_subscription_history(v_request.user_id, v_previous_status, 'premium', 'lifetime', v_paid_at, null, null, 'toyyibpay_paid');

  return jsonb_build_object('ok', true, 'id', p_payment_request_id, 'status', 'paid', 'user_id', v_request.user_id);
end;
$$;

revoke all on function public.activate_toyyibpay_premium(uuid, text, text, jsonb) from public;
grant execute on function public.activate_toyyibpay_premium(uuid, text, text, jsonb) to service_role;

create or replace function public.admin_list_payment_requests(
  search_text text default null,
  status_filter text default 'pending',
  page_number integer default 1,
  page_size integer default 50
)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  email text,
  amount numeric,
  currency text,
  status text,
  provider text,
  payment_method text,
  provider_bill_code text,
  provider_reference text,
  external_reference text,
  paid_at timestamptz,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_name text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_page integer := greatest(coalesce(page_number, 1), 1);
  v_size integer := least(greatest(coalesce(page_size, 50), 1), 100);
begin
  return query
  with request_rows as (
    select
      pr.id,
      pr.user_id,
      coalesce(p.display_name, p.full_name, au.raw_user_meta_data ->> 'display_name')::text as display_name,
      coalesce(pr.email, au.email)::text as email,
      pr.amount,
      pr.currency,
      pr.status,
      pr.provider,
      pr.payment_method,
      pr.provider_bill_code,
      pr.provider_reference,
      pr.external_reference,
      pr.paid_at,
      pr.notes,
      pr.created_at,
      pr.updated_at,
      pr.reviewed_at,
      coalesce(reviewer.display_name, reviewer.full_name)::text as reviewed_by_name
    from public.payment_requests pr
    left join public.profiles p on p.id = pr.user_id
    left join auth.users au on au.id = pr.user_id
    left join public.profiles reviewer on reviewer.id = pr.reviewed_by
    where (
      coalesce(status_filter, '') = ''
      or status_filter = 'all'
      or pr.status = status_filter
    )
    and (
      coalesce(search_text, '') = ''
      or pr.email ilike '%' || search_text || '%'
      or au.email ilike '%' || search_text || '%'
      or p.display_name ilike '%' || search_text || '%'
      or p.full_name ilike '%' || search_text || '%'
      or pr.provider_bill_code ilike '%' || search_text || '%'
      or pr.provider_reference ilike '%' || search_text || '%'
      or pr.external_reference ilike '%' || search_text || '%'
    )
  )
  select request_rows.*, count(*) over() as total_count
  from request_rows
  order by request_rows.created_at desc
  offset (v_page - 1) * v_size
  limit v_size;
end;
$$;

create or replace function public.admin_update_payment_request(
  p_request_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_request public.payment_requests%rowtype;
  v_target_user_id uuid;
  v_previous_status text;
  v_started_at timestamptz := now();
begin
  if p_status not in ('approved', 'rejected', 'expired') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;

  select *
  into v_request
  from public.payment_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'PAYMENT_REQUEST_NOT_FOUND';
  end if;

  if coalesce(v_request.payment_method, v_request.provider) = 'toyyibpay' and p_status = 'approved' then
    raise exception 'TOYYIBPAY_DOES_NOT_NEED_ADMIN_APPROVAL';
  end if;

  v_target_user_id := v_request.user_id;

  if v_target_user_id is null and nullif(btrim(coalesce(v_request.email, '')), '') is not null then
    select id
    into v_target_user_id
    from auth.users
    where lower(email) = lower(v_request.email)
    order by created_at desc
    limit 1;
  end if;

  update public.payment_requests
  set
    status = p_status,
    notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
    reviewed_by = v_admin_id,
    reviewed_at = v_started_at,
    user_id = coalesce(user_id, v_target_user_id)
  where id = p_request_id;

  if p_status = 'approved' then
    if v_target_user_id is null then
      raise exception 'USER_NOT_FOUND';
    end if;

    select subscription_status
    into v_previous_status
    from public.profiles
    where id = v_target_user_id
    for update;

    if v_previous_status is null then
      raise exception 'USER_NOT_FOUND';
    end if;

    update public.profiles
    set
      subscription_status = 'premium',
      subscription_plan = 'lifetime',
      subscription_started_at = v_started_at,
      subscription_ends_at = null,
      access_granted_at = v_started_at,
      access_granted_by = v_admin_id,
      is_blocked = false
    where id = v_target_user_id;

    perform public.write_subscription_history(v_target_user_id, v_previous_status, 'premium', 'lifetime', v_started_at, null, v_admin_id, 'manual_payment_approved');
    perform public.write_admin_audit(v_admin_id, v_target_user_id, 'approve_manual_payment', jsonb_build_object('payment_request_id', p_request_id, 'amount', v_request.amount));
  else
    perform public.write_admin_audit(v_admin_id, v_target_user_id, 'update_manual_payment', jsonb_build_object('payment_request_id', p_request_id, 'status', p_status));
  end if;

  return jsonb_build_object('ok', true, 'id', p_request_id, 'status', p_status, 'user_id', v_target_user_id);
end;
$$;

grant execute on function public.create_manual_payment_request(text) to anon, authenticated;
grant execute on function public.get_my_pending_payment_request() to authenticated;
grant execute on function public.get_my_latest_payment_request() to authenticated;
grant execute on function public.admin_list_payment_requests(text, text, integer, integer) to authenticated;
grant execute on function public.admin_update_payment_request(uuid, text, text) to authenticated;
