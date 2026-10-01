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
  v_amount numeric := 49.00;
  v_plan text := 'lifetime';
  v_request_id uuid;
  v_normalized_referral_code text := public.normalize_referral_code(p_referral_code);
  v_referral_agent_id uuid;
  v_referral_code text;
begin
  if now() <= timestamptz '2026-10-11 15:59:59+00' then
    v_amount := 29.00;
    v_plan := 'pksk_promo_2026_21d';
  else
    select coalesce((value #>> '{}')::numeric, 49.00)
    into v_amount
    from public.app_settings
    where key = 'payment_price';

    v_amount := coalesce(v_amount, 49.00);
  end if;

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
    v_plan || ' | DuitNow QR + WhatsApp'
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
    'referral_agent_id', v_referral_agent_id,
    'plan', v_plan
  );
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
  v_profile public.profiles%rowtype;
  v_target_user_id uuid;
  v_started_at timestamptz := now();
  v_plan text;
  v_ends_at timestamptz;
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

  if p_status = 'approved' and v_request.status in ('approved', 'paid') then
    return jsonb_build_object('ok', true, 'idempotent', true, 'id', p_request_id, 'status', v_request.status, 'user_id', v_request.user_id);
  end if;

  if p_status = 'approved' then
    if v_request.amount = 29.00 then
      v_plan := 'pksk_promo_2026_21d';
      v_ends_at := v_started_at + interval '21 days';
    elsif v_request.amount = 49.00 then
      v_plan := 'lifetime';
      v_ends_at := null;
    else
      raise exception 'INVALID_PAYMENT_AMOUNT';
    end if;
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

    select *
    into v_profile
    from public.profiles
    where id = v_target_user_id
    for update;

    if v_profile.id is null then
      raise exception 'USER_NOT_FOUND';
    end if;

    if v_profile.subscription_status = 'premium'
      and v_profile.subscription_plan = 'lifetime'
      and v_profile.subscription_ends_at is null then
      perform public.write_subscription_history(v_target_user_id, v_profile.subscription_status, 'premium', 'lifetime', v_profile.subscription_started_at, null, v_admin_id, 'manual_payment_lifetime_preserved');
    else
      update public.profiles
      set
        subscription_status = 'premium',
        subscription_plan = v_plan,
        subscription_started_at = v_started_at,
        subscription_ends_at = v_ends_at,
        access_granted_at = v_started_at,
        access_granted_by = v_admin_id,
        is_blocked = false
      where id = v_target_user_id;

      perform public.write_subscription_history(v_target_user_id, v_profile.subscription_status, 'premium', v_plan, v_started_at, v_ends_at, v_admin_id, 'manual_payment_approved');
    end if;

    perform public.write_admin_audit(v_admin_id, v_target_user_id, 'approve_manual_payment', jsonb_build_object('payment_request_id', p_request_id, 'amount', v_request.amount, 'plan', v_plan));

    if coalesce(v_request.payment_method, v_request.provider) = 'manual_qr' then
      v_commission := public.create_agent_commission_for_payment_request(p_request_id, v_target_user_id, v_started_at);
    end if;
  else
    perform public.write_admin_audit(v_admin_id, v_target_user_id, 'update_manual_payment', jsonb_build_object('payment_request_id', p_request_id, 'status', p_status));
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', p_request_id,
    'status', p_status,
    'user_id', v_target_user_id,
    'plan', v_plan,
    'subscription_ends_at', v_ends_at,
    'commission', v_commission
  );
end;
$$;

grant execute on function public.create_manual_payment_request(text, text) to anon, authenticated;
grant execute on function public.admin_update_payment_request(uuid, text, text) to authenticated;
