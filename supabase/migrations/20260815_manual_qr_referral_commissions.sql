create extension if not exists pgcrypto;

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  referral_code text unique,
  status text not null default 'pending',
  bank_account_name text,
  bank_name text,
  bank_account_number text,
  phone text,
  commission_amount numeric not null default 23,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agents_status_check check (status in ('not_agent', 'pending', 'active', 'suspended'))
);

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  referred_user_id uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null,
  created_at timestamptz not null default now(),
  constraint affiliate_referrals_referred_user_unique unique (referred_user_id)
);

create table if not exists public.agent_commissions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  buyer_user_id uuid not null references public.profiles(id) on delete cascade,
  payment_request_id uuid not null references public.payment_requests(id) on delete cascade,
  amount numeric not null default 23,
  status text not null default 'pending_14_days',
  payment_confirmed_at timestamptz not null,
  eligible_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint agent_commissions_status_check check (status in ('pending_14_days', 'eligible', 'paid', 'cancelled')),
  constraint agent_commissions_payment_request_unique unique (payment_request_id)
);

alter table public.payment_requests add column if not exists referral_code text;
alter table public.payment_requests add column if not exists referral_agent_id uuid references public.agents(id) on delete set null;

create index if not exists idx_agents_status_code on public.agents (status, referral_code);
create index if not exists idx_affiliate_referrals_agent on public.affiliate_referrals (agent_id, created_at desc);
create index if not exists idx_agent_commissions_agent_status on public.agent_commissions (agent_id, status, created_at desc);
create index if not exists idx_agent_commissions_buyer on public.agent_commissions (buyer_user_id, created_at desc);
create index if not exists idx_payment_requests_referral_agent on public.payment_requests (referral_agent_id, created_at desc);

drop trigger if exists agents_touch_updated_at on public.agents;
create trigger agents_touch_updated_at
before update on public.agents
for each row execute function public.touch_updated_at();

alter table public.agents enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.agent_commissions enable row level security;

drop policy if exists "agents select own or admin" on public.agents;
create policy "agents select own or admin"
on public.agents for select
to authenticated
using (user_id = auth.uid() or public.is_admin_user(auth.uid()));

drop policy if exists "affiliate referrals select related or admin" on public.affiliate_referrals;
create policy "affiliate referrals select related or admin"
on public.affiliate_referrals for select
to authenticated
using (
  referred_user_id = auth.uid()
  or public.is_admin_user(auth.uid())
  or exists (
    select 1
    from public.agents a
    where a.id = affiliate_referrals.agent_id
      and a.user_id = auth.uid()
  )
);

drop policy if exists "agent commissions select related or admin" on public.agent_commissions;
create policy "agent commissions select related or admin"
on public.agent_commissions for select
to authenticated
using (
  buyer_user_id = auth.uid()
  or public.is_admin_user(auth.uid())
  or exists (
    select 1
    from public.agents a
    where a.id = agent_commissions.agent_id
      and a.user_id = auth.uid()
  )
);

insert into public.app_settings (key, value, description)
values ('agent_commission_amount', '23'::jsonb, 'Komisen Diamond Partner untuk setiap pembelian Premium yang sah.')
on conflict (key) do nothing;

create or replace function public.normalize_referral_code(p_referral_code text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(upper(btrim(coalesce(p_referral_code, ''))), '[^A-Z0-9]', '', 'g'), '');
$$;

create or replace function public.get_agent_commission_amount()
returns numeric
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_amount numeric;
begin
  select coalesce((value #>> '{}')::numeric, 23)
  into v_amount
  from public.app_settings
  where key = 'agent_commission_amount';

  return coalesce(v_amount, 23);
end;
$$;

create or replace function public.set_referral_attribution_for_user(
  p_user_id uuid,
  p_referral_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := public.normalize_referral_code(p_referral_code);
  v_existing_agent_id uuid;
  v_existing_code text;
  v_agent_id uuid;
  v_agent_user_id uuid;
  v_agent_code text;
begin
  if p_user_id is null or v_code is null then
    return jsonb_build_object('ok', true, 'attributed', false);
  end if;

  select ar.agent_id, ar.referral_code
  into v_existing_agent_id, v_existing_code
  from public.affiliate_referrals ar
  where ar.referred_user_id = p_user_id
  order by ar.created_at
  limit 1;

  if v_existing_agent_id is not null then
    return jsonb_build_object(
      'ok', true,
      'attributed', true,
      'existing', true,
      'agent_id', v_existing_agent_id,
      'referral_code', v_existing_code
    );
  end if;

  select a.id, a.user_id, a.referral_code
  into v_agent_id, v_agent_user_id, v_agent_code
  from public.agents a
  where public.normalize_referral_code(a.referral_code) = v_code
    and a.status = 'active'
  limit 1;

  if v_agent_id is null then
    return jsonb_build_object('ok', true, 'attributed', false, 'reason', 'REFERRAL_AGENT_NOT_ACTIVE');
  end if;

  if v_agent_user_id = p_user_id then
    return jsonb_build_object('ok', true, 'attributed', false, 'reason', 'SELF_REFERRAL');
  end if;

  insert into public.affiliate_referrals (agent_id, referred_user_id, referral_code)
  values (v_agent_id, p_user_id, coalesce(public.normalize_referral_code(v_agent_code), v_code))
  on conflict (referred_user_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'attributed', true,
    'agent_id', v_agent_id,
    'referral_code', coalesce(public.normalize_referral_code(v_agent_code), v_code)
  );
end;
$$;

create or replace function public.remember_my_referral_attribution(p_referral_code text)
returns jsonb
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

  return public.set_referral_attribution_for_user(v_user_id, p_referral_code);
end;
$$;

create or replace function public.create_agent_commission_for_payment_request(
  p_payment_request_id uuid,
  p_buyer_user_id uuid default null,
  p_payment_confirmed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.payment_requests%rowtype;
  v_buyer_user_id uuid;
  v_agent_id uuid;
  v_agent_user_id uuid;
  v_agent_code text;
  v_agent_status text;
  v_agent_amount numeric;
  v_confirmed_at timestamptz;
  v_commission_id uuid;
begin
  select *
  into v_request
  from public.payment_requests
  where id = p_payment_request_id
  for update;

  if v_request.id is null then
    raise exception 'PAYMENT_REQUEST_NOT_FOUND';
  end if;

  select id
  into v_commission_id
  from public.agent_commissions
  where payment_request_id = p_payment_request_id
  limit 1;

  if v_commission_id is not null then
    return jsonb_build_object('ok', true, 'commission_created', false, 'idempotent', true, 'commission_id', v_commission_id);
  end if;

  v_buyer_user_id := coalesce(p_buyer_user_id, v_request.user_id);
  if v_buyer_user_id is null then
    return jsonb_build_object('ok', true, 'commission_created', false, 'reason', 'BUYER_USER_NOT_FOUND');
  end if;

  select a.id, a.user_id, a.referral_code, a.status, a.commission_amount
  into v_agent_id, v_agent_user_id, v_agent_code, v_agent_status, v_agent_amount
  from public.affiliate_referrals ar
  join public.agents a on a.id = ar.agent_id
  where ar.referred_user_id = v_buyer_user_id
  order by ar.created_at
  limit 1;

  if v_agent_id is not null and v_agent_status <> 'active' then
    return jsonb_build_object('ok', true, 'commission_created', false, 'reason', 'REFERRAL_AGENT_NOT_ACTIVE');
  end if;

  if v_agent_id is null and v_request.referral_agent_id is not null then
    select a.id, a.user_id, a.referral_code, a.status, a.commission_amount
    into v_agent_id, v_agent_user_id, v_agent_code, v_agent_status, v_agent_amount
    from public.agents a
    where a.id = v_request.referral_agent_id
      and a.status = 'active'
    limit 1;
  end if;

  if v_agent_id is null and nullif(btrim(coalesce(v_request.referral_code, '')), '') is not null then
    select a.id, a.user_id, a.referral_code, a.status, a.commission_amount
    into v_agent_id, v_agent_user_id, v_agent_code, v_agent_status, v_agent_amount
    from public.agents a
    where public.normalize_referral_code(a.referral_code) = public.normalize_referral_code(v_request.referral_code)
      and a.status = 'active'
    limit 1;
  end if;

  if v_agent_id is null then
    return jsonb_build_object('ok', true, 'commission_created', false, 'reason', 'NO_ACTIVE_REFERRAL_AGENT');
  end if;

  if v_agent_user_id = v_buyer_user_id then
    return jsonb_build_object('ok', true, 'commission_created', false, 'reason', 'SELF_REFERRAL');
  end if;

  insert into public.affiliate_referrals (agent_id, referred_user_id, referral_code)
  values (v_agent_id, v_buyer_user_id, coalesce(public.normalize_referral_code(v_agent_code), public.normalize_referral_code(v_request.referral_code)))
  on conflict (referred_user_id) do nothing;

  v_confirmed_at := coalesce(p_payment_confirmed_at, v_request.paid_at, v_request.reviewed_at, now());
  v_agent_amount := coalesce(v_agent_amount, public.get_agent_commission_amount());

  insert into public.agent_commissions (
    agent_id,
    buyer_user_id,
    payment_request_id,
    amount,
    status,
    payment_confirmed_at,
    eligible_at
  )
  values (
    v_agent_id,
    v_buyer_user_id,
    p_payment_request_id,
    v_agent_amount,
    'pending_14_days',
    v_confirmed_at,
    v_confirmed_at + interval '14 days'
  )
  on conflict (payment_request_id) do nothing
  returning id into v_commission_id;

  update public.payment_requests
  set
    referral_agent_id = coalesce(referral_agent_id, v_agent_id),
    referral_code = coalesce(referral_code, public.normalize_referral_code(v_agent_code), public.normalize_referral_code(v_request.referral_code))
  where id = p_payment_request_id;

  if v_commission_id is null then
    select id
    into v_commission_id
    from public.agent_commissions
    where payment_request_id = p_payment_request_id
    limit 1;

    return jsonb_build_object('ok', true, 'commission_created', false, 'idempotent', true, 'commission_id', v_commission_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'commission_created', true,
    'commission_id', v_commission_id,
    'agent_id', v_agent_id,
    'buyer_user_id', v_buyer_user_id,
    'payment_request_id', p_payment_request_id,
    'amount', v_agent_amount,
    'payment_confirmed_at', v_confirmed_at,
    'eligible_at', v_confirmed_at + interval '14 days',
    'status', 'pending_14_days'
  );
end;
$$;

drop function if exists public.create_manual_payment_request(text);

create or replace function public.create_manual_payment_request(
  p_email text default null,
  p_referral_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_amount numeric;
  v_request_id uuid;
  v_normalized_referral_code text := public.normalize_referral_code(p_referral_code);
  v_referral_agent_id uuid;
  v_referral_code text;
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

  if v_user_id is not null and v_normalized_referral_code is not null then
    perform public.set_referral_attribution_for_user(v_user_id, v_normalized_referral_code);
  end if;

  if v_user_id is not null then
    select ar.agent_id, ar.referral_code
    into v_referral_agent_id, v_referral_code
    from public.affiliate_referrals ar
    where ar.referred_user_id = v_user_id
    order by ar.created_at
    limit 1;
  end if;

  if v_referral_agent_id is null and v_normalized_referral_code is not null then
    select a.id, public.normalize_referral_code(a.referral_code)
    into v_referral_agent_id, v_referral_code
    from public.agents a
    where public.normalize_referral_code(a.referral_code) = v_normalized_referral_code
      and a.status = 'active'
    limit 1;
  end if;

  insert into public.payment_requests (
    user_id,
    email,
    amount,
    currency,
    status,
    provider,
    payment_method,
    referral_code,
    referral_agent_id,
    notes
  )
  values (
    v_user_id,
    v_email,
    v_amount,
    'MYR',
    'pending',
    'manual_qr',
    'manual_qr',
    v_referral_code,
    v_referral_agent_id,
    'DuitNow QR + WhatsApp MVP'
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'id', v_request_id,
    'user_id', v_user_id,
    'email', v_email,
    'amount', v_amount,
    'currency', 'MYR',
    'status', 'pending',
    'provider', 'manual_qr',
    'payment_method', 'manual_qr',
    'referral_code', v_referral_code,
    'referral_agent_id', v_referral_agent_id
  );
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
  v_commission jsonb;
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
    v_commission := public.create_agent_commission_for_payment_request(p_payment_request_id, v_request.user_id, coalesce(v_request.paid_at, v_paid_at));
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', v_request.status, 'commission', v_commission);
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
  v_commission := public.create_agent_commission_for_payment_request(p_payment_request_id, v_request.user_id, v_paid_at);

  return jsonb_build_object('ok', true, 'id', p_payment_request_id, 'status', 'paid', 'user_id', v_request.user_id, 'commission', v_commission);
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
  v_commission jsonb;
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
    paid_at = case when p_status = 'approved' then coalesce(paid_at, v_started_at) else paid_at end,
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

    if coalesce(v_request.payment_method, v_request.provider) = 'manual_qr' then
      v_commission := public.create_agent_commission_for_payment_request(p_request_id, v_target_user_id, v_started_at);
    end if;
  else
    perform public.write_admin_audit(v_admin_id, v_target_user_id, 'update_manual_payment', jsonb_build_object('payment_request_id', p_request_id, 'status', p_status));
  end if;

  return jsonb_build_object('ok', true, 'id', p_request_id, 'status', p_status, 'user_id', v_target_user_id, 'commission', v_commission);
end;
$$;

revoke all on function public.set_referral_attribution_for_user(uuid, text) from public;
revoke all on function public.create_agent_commission_for_payment_request(uuid, uuid, timestamptz) from public;
revoke all on function public.activate_toyyibpay_premium(uuid, text, text, jsonb) from public;

grant select on table public.agents to authenticated;
grant select on table public.affiliate_referrals to authenticated;
grant select on table public.agent_commissions to authenticated;
grant select, insert, update on table public.agents to service_role;
grant select, insert, update on table public.affiliate_referrals to service_role;
grant select, insert, update on table public.agent_commissions to service_role;
grant select, update on table public.payment_requests to service_role;

grant execute on function public.set_referral_attribution_for_user(uuid, text) to service_role;
grant execute on function public.remember_my_referral_attribution(text) to authenticated;
grant execute on function public.create_agent_commission_for_payment_request(uuid, uuid, timestamptz) to service_role;
grant execute on function public.create_manual_payment_request(text, text) to anon, authenticated;
grant execute on function public.activate_toyyibpay_premium(uuid, text, text, jsonb) to service_role;
grant execute on function public.admin_update_payment_request(uuid, text, text) to authenticated;
