insert into public.subscription_plans (code, name, description, duration_days, price, is_active, sort_order)
values ('pksk_promo_2026_21d', 'Promosi Khas PKSK 2026', 'Akses Premium selama 21 hari untuk promosi PKSK 2026.', 21, 29, true, 35)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  duration_days = excluded.duration_days,
  price = excluded.price,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;

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
  v_profile public.profiles%rowtype;
  v_paid_at timestamptz := now();
  v_plan text;
  v_ends_at timestamptz;
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

  if v_request.amount = 29.00 then
    v_plan := 'pksk_promo_2026_21d';
    v_ends_at := v_paid_at + interval '21 days';
  elsif v_request.amount = 49.00 then
    v_plan := 'lifetime';
    v_ends_at := null;
  else
    raise exception 'INVALID_PAYMENT_AMOUNT';
  end if;

  if v_request.status in ('paid', 'approved') then
    v_commission := public.create_agent_commission_for_payment_request(p_payment_request_id, v_request.user_id, coalesce(v_request.paid_at, v_paid_at));
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', v_request.status, 'commission', v_commission);
  end if;

  if v_request.user_id is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_request.user_id
  for update;

  if v_profile.id is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  update public.payment_requests
  set
    status = 'paid',
    provider_reference = nullif(btrim(coalesce(p_provider_reference, '')), ''),
    provider_bill_code = coalesce(nullif(btrim(coalesce(p_provider_bill_code, '')), ''), provider_bill_code),
    paid_at = v_paid_at,
    provider_response = coalesce(p_provider_response, '{}'::jsonb),
    notes = coalesce(nullif(notes, ''), v_plan) || ' | ToyyibPay payment successful'
  where id = p_payment_request_id;

  perform set_config('app.allow_server_payment_update', 'true', true);

  if v_profile.subscription_status = 'premium'
    and v_profile.subscription_plan = 'lifetime'
    and v_profile.subscription_ends_at is null then
    perform public.write_subscription_history(v_request.user_id, v_profile.subscription_status, 'premium', 'lifetime', v_profile.subscription_started_at, null, null, 'toyyibpay_paid_lifetime_preserved');
  else
    update public.profiles
    set
      subscription_status = 'premium',
      subscription_plan = v_plan,
      subscription_started_at = v_paid_at,
      subscription_ends_at = v_ends_at,
      access_granted_at = v_paid_at
    where id = v_request.user_id;

    perform public.write_subscription_history(v_request.user_id, v_profile.subscription_status, 'premium', v_plan, v_paid_at, v_ends_at, null, 'toyyibpay_paid');
  end if;

  v_commission := public.create_agent_commission_for_payment_request(p_payment_request_id, v_request.user_id, v_paid_at);

  return jsonb_build_object(
    'ok', true,
    'id', p_payment_request_id,
    'status', 'paid',
    'user_id', v_request.user_id,
    'plan', v_plan,
    'subscription_started_at', v_paid_at,
    'subscription_ends_at', v_ends_at,
    'commission', v_commission
  );
end;
$$;
