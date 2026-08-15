create extension if not exists pgcrypto;

create table if not exists public.agent_referral_clicks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  referral_code text not null,
  clicked_at timestamptz not null default now()
);

create index if not exists idx_agent_referral_clicks_agent on public.agent_referral_clicks (agent_id, clicked_at desc);

alter table public.agent_referral_clicks enable row level security;

drop policy if exists "agent referral clicks select own or admin" on public.agent_referral_clicks;
create policy "agent referral clicks select own or admin"
on public.agent_referral_clicks for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1
    from public.agents a
    where a.id = agent_referral_clicks.agent_id
      and a.user_id = auth.uid()
  )
);

drop policy if exists "agents update own bank fields" on public.agents;
create policy "agents update own bank fields"
on public.agents for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke update on table public.agents from authenticated;
grant update (bank_account_name, bank_name, bank_account_number, phone, updated_at) on table public.agents to authenticated;
grant select on table public.agent_referral_clicks to authenticated;
grant select, insert on table public.agent_referral_clicks to service_role;

create or replace function public.mask_email_for_agent(p_email text)
returns text
language plpgsql
immutable
as $$
declare
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_local text;
  v_domain text;
begin
  if v_email is null or position('@' in v_email) = 0 then
    return null;
  end if;

  v_local := split_part(v_email, '@', 1);
  v_domain := split_part(v_email, '@', 2);

  return left(v_local, 1) || '***@' || v_domain;
end;
$$;

create or replace function public.get_effective_commission_status(
  p_status text,
  p_eligible_at timestamptz
)
returns text
language sql
stable
as $$
  select case
    when p_status = 'pending_14_days' and p_eligible_at <= now() then 'eligible'
    else p_status
  end;
$$;

create or replace function public.generate_agent_referral_code(p_agent_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 7));

    exit when not exists (
      select 1
      from public.agents a
      where public.normalize_referral_code(a.referral_code) = v_code
        and a.id <> p_agent_id
    );

    if v_attempt >= 20 then
      raise exception 'REFERRAL_CODE_GENERATION_FAILED';
    end if;
  end loop;

  return v_code;
end;
$$;

create or replace function public.diamond_profile_json(p_agent public.agents)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_code text := public.normalize_referral_code(p_agent.referral_code);
  v_account_number text := regexp_replace(coalesce(p_agent.bank_account_number, ''), '\D', '', 'g');
begin
  return jsonb_build_object(
    'id', p_agent.id,
    'user_id', p_agent.user_id,
    'referral_code', v_code,
    'referral_link', case when v_code is null then null else 'https://pksk.cikgustem.com/?ref=' || v_code end,
    'status', p_agent.status,
    'bank_account_name', p_agent.bank_account_name,
    'bank_name', p_agent.bank_name,
    'bank_account_last4', case when length(v_account_number) >= 4 then right(v_account_number, 4) else null end,
    'phone', p_agent.phone,
    'commission_amount', coalesce(p_agent.commission_amount, public.get_agent_commission_amount()),
    'approved_at', p_agent.approved_at,
    'created_at', p_agent.created_at,
    'updated_at', p_agent.updated_at
  );
end;
$$;

create or replace function public.get_my_diamond_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_agent public.agents%rowtype;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select *
  into v_agent
  from public.agents
  where user_id = v_user_id
  limit 1;

  if v_agent.id is null then
    return jsonb_build_object(
      'id', null,
      'user_id', v_user_id,
      'referral_code', null,
      'referral_link', null,
      'status', 'not_agent',
      'bank_account_name', null,
      'bank_name', null,
      'bank_account_last4', null,
      'phone', null,
      'commission_amount', public.get_agent_commission_amount(),
      'approved_at', null,
      'created_at', null,
      'updated_at', null
    );
  end if;

  return public.diamond_profile_json(v_agent);
end;
$$;

create or replace function public.apply_for_diamond(
  p_bank_account_name text,
  p_bank_name text,
  p_bank_account_number text,
  p_phone text,
  p_terms_accepted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_agent public.agents%rowtype;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if not public.is_premium_user(v_user_id) then
    raise exception 'PREMIUM_REQUIRED';
  end if;

  if coalesce(p_terms_accepted, false) is false then
    raise exception 'DIAMOND_TERMS_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_bank_account_name, '')), '') is null
    or nullif(btrim(coalesce(p_bank_name, '')), '') is null
    or nullif(regexp_replace(coalesce(p_bank_account_number, ''), '\D', '', 'g'), '') is null
    or nullif(btrim(coalesce(p_phone, '')), '') is null then
    raise exception 'DIAMOND_BANK_INFO_REQUIRED';
  end if;

  select *
  into v_agent
  from public.agents
  where user_id = v_user_id
  for update;

  if v_agent.id is not null and v_agent.status = 'active' then
    raise exception 'DIAMOND_ALREADY_ACTIVE';
  end if;

  if v_agent.id is not null and v_agent.status = 'suspended' then
    raise exception 'DIAMOND_SUSPENDED';
  end if;

  if v_agent.id is null then
    insert into public.agents (
      user_id,
      status,
      bank_account_name,
      bank_name,
      bank_account_number,
      phone,
      commission_amount
    )
    values (
      v_user_id,
      'pending',
      btrim(p_bank_account_name),
      btrim(p_bank_name),
      regexp_replace(p_bank_account_number, '\D', '', 'g'),
      btrim(p_phone),
      public.get_agent_commission_amount()
    )
    returning * into v_agent;
  else
    update public.agents
    set
      status = 'pending',
      bank_account_name = btrim(p_bank_account_name),
      bank_name = btrim(p_bank_name),
      bank_account_number = regexp_replace(p_bank_account_number, '\D', '', 'g'),
      phone = btrim(p_phone),
      updated_at = now()
    where id = v_agent.id
    returning * into v_agent;
  end if;

  return public.diamond_profile_json(v_agent);
end;
$$;

create or replace function public.update_my_diamond_bank_info(
  p_bank_account_name text,
  p_bank_name text,
  p_bank_account_number text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_agent public.agents%rowtype;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_bank_account_name, '')), '') is null
    or nullif(btrim(coalesce(p_bank_name, '')), '') is null
    or nullif(regexp_replace(coalesce(p_bank_account_number, ''), '\D', '', 'g'), '') is null
    or nullif(btrim(coalesce(p_phone, '')), '') is null then
    raise exception 'DIAMOND_BANK_INFO_REQUIRED';
  end if;

  update public.agents
  set
    bank_account_name = btrim(p_bank_account_name),
    bank_name = btrim(p_bank_name),
    bank_account_number = regexp_replace(p_bank_account_number, '\D', '', 'g'),
    phone = btrim(p_phone),
    updated_at = now()
  where user_id = v_user_id
    and status in ('pending', 'active', 'suspended')
  returning * into v_agent;

  if v_agent.id is null then
    raise exception 'DIAMOND_AGENT_NOT_FOUND';
  end if;

  return public.diamond_profile_json(v_agent);
end;
$$;

create or replace function public.track_referral_click(p_referral_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := public.normalize_referral_code(p_referral_code);
  v_user_id uuid := auth.uid();
  v_agent_id uuid;
  v_agent_user_id uuid;
begin
  if v_code is null then
    return jsonb_build_object('ok', true, 'tracked', false);
  end if;

  select id, user_id
  into v_agent_id, v_agent_user_id
  from public.agents
  where public.normalize_referral_code(referral_code) = v_code
    and status = 'active'
  limit 1;

  if v_agent_id is null then
    return jsonb_build_object('ok', true, 'tracked', false, 'reason', 'REFERRAL_AGENT_NOT_ACTIVE');
  end if;

  if v_user_id is not null and v_user_id = v_agent_user_id then
    return jsonb_build_object('ok', true, 'tracked', false, 'reason', 'SELF_REFERRAL');
  end if;

  insert into public.agent_referral_clicks (agent_id, referral_code)
  values (v_agent_id, v_code);

  return jsonb_build_object('ok', true, 'tracked', true, 'agent_id', v_agent_id, 'referral_code', v_code);
end;
$$;

create or replace function public.get_my_diamond_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_agent public.agents%rowtype;
  v_stats jsonb;
  v_commissions jsonb;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if not public.is_premium_user(v_user_id) then
    raise exception 'PREMIUM_REQUIRED';
  end if;

  select *
  into v_agent
  from public.agents
  where user_id = v_user_id
  limit 1;

  if v_agent.id is null then
    raise exception 'DIAMOND_AGENT_NOT_FOUND';
  end if;

  if v_agent.status <> 'active' then
    raise exception 'DIAMOND_NOT_ACTIVE';
  end if;

  select jsonb_build_object(
    'total_clicks', coalesce((select count(*) from public.agent_referral_clicks c where c.agent_id = v_agent.id), 0),
    'total_sales', coalesce(count(*) filter (where ac.status <> 'cancelled'), 0),
    'total_commission', coalesce(sum(ac.amount) filter (where ac.status <> 'cancelled'), 0),
    'pending_14_days', coalesce(sum(ac.amount) filter (where ac.status = 'pending_14_days' and ac.eligible_at > now()), 0),
    'eligible', coalesce(sum(ac.amount) filter (where ac.status = 'eligible' or (ac.status = 'pending_14_days' and ac.eligible_at <= now())), 0),
    'paid', coalesce(sum(ac.amount) filter (where ac.status = 'paid'), 0)
  )
  into v_stats
  from public.agent_commissions ac
  where ac.agent_id = v_agent.id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ac.id,
      'buyer_name', coalesce(p.display_name, p.full_name),
      'buyer_email_masked', public.mask_email_for_agent(u.email),
      'payment_confirmed_at', ac.payment_confirmed_at,
      'eligible_at', ac.eligible_at,
      'paid_at', ac.paid_at,
      'amount', ac.amount,
      'status', ac.status,
      'effective_status', public.get_effective_commission_status(ac.status, ac.eligible_at)
    )
    order by ac.payment_confirmed_at desc
  ), '[]'::jsonb)
  into v_commissions
  from public.agent_commissions ac
  left join public.profiles p on p.id = ac.buyer_user_id
  left join auth.users u on u.id = ac.buyer_user_id
  where ac.agent_id = v_agent.id;

  return jsonb_build_object(
    'profile', public.diamond_profile_json(v_agent),
    'stats', v_stats,
    'commissions', v_commissions
  );
end;
$$;

create or replace function public.admin_list_diamond_partners(
  search_text text default null,
  status_filter text default 'pending',
  page_number integer default 1,
  page_size integer default 50
)
returns table (
  id uuid,
  user_id uuid,
  name text,
  email text,
  referral_code text,
  status text,
  total_sales integer,
  total_commission numeric,
  eligible_commission numeric,
  paid_commission numeric,
  bank_name text,
  bank_account_last4 text,
  created_at timestamptz,
  approved_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_search text := lower(nullif(btrim(coalesce(search_text, '')), ''));
  v_status text := lower(coalesce(nullif(btrim(status_filter), ''), 'pending'));
  v_page integer := greatest(coalesce(page_number, 1), 1);
  v_size integer := least(greatest(coalesce(page_size, 50), 1), 100);
begin
  return query
  select
    a.id,
    a.user_id,
    coalesce(p.display_name, p.full_name)::text as name,
    u.email::text as email,
    public.normalize_referral_code(a.referral_code)::text as referral_code,
    a.status::text as status,
    coalesce(stats.total_sales, 0)::integer as total_sales,
    coalesce(stats.total_commission, 0)::numeric as total_commission,
    coalesce(stats.eligible_commission, 0)::numeric as eligible_commission,
    coalesce(stats.paid_commission, 0)::numeric as paid_commission,
    a.bank_name::text as bank_name,
    case
      when length(regexp_replace(coalesce(a.bank_account_number, ''), '\D', '', 'g')) >= 4
      then right(regexp_replace(a.bank_account_number, '\D', '', 'g'), 4)
      else null
    end as bank_account_last4,
    a.created_at,
    a.approved_at,
    count(*) over() as total_count
  from public.agents a
  join public.profiles p on p.id = a.user_id
  left join auth.users u on u.id = a.user_id
  left join lateral (
    select
      count(*) filter (where ac.status <> 'cancelled') as total_sales,
      sum(ac.amount) filter (where ac.status <> 'cancelled') as total_commission,
      sum(ac.amount) filter (where ac.status = 'eligible' or (ac.status = 'pending_14_days' and ac.eligible_at <= now())) as eligible_commission,
      sum(ac.amount) filter (where ac.status = 'paid') as paid_commission
    from public.agent_commissions ac
    where ac.agent_id = a.id
  ) stats on true
  where (v_status = 'all' or a.status = v_status)
    and (
      v_search is null
      or lower(coalesce(p.display_name, p.full_name, '')) like '%' || v_search || '%'
      or lower(coalesce(u.email, '')) like '%' || v_search || '%'
      or lower(coalesce(a.referral_code, '')) like '%' || v_search || '%'
      or lower(coalesce(a.bank_name, '')) like '%' || v_search || '%'
    )
  order by
    case a.status when 'pending' then 1 when 'active' then 2 when 'suspended' then 3 else 4 end,
    a.created_at desc
  limit v_size
  offset (v_page - 1) * v_size;
end;
$$;

create or replace function public.admin_get_diamond_partner(p_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_agent jsonb;
  v_commissions jsonb;
begin
  select jsonb_build_object(
    'id', a.id,
    'user_id', a.user_id,
    'name', coalesce(p.display_name, p.full_name),
    'email', u.email,
    'referral_code', public.normalize_referral_code(a.referral_code),
    'status', a.status,
    'total_sales', coalesce(stats.total_sales, 0),
    'total_commission', coalesce(stats.total_commission, 0),
    'eligible_commission', coalesce(stats.eligible_commission, 0),
    'paid_commission', coalesce(stats.paid_commission, 0),
    'bank_account_name', a.bank_account_name,
    'bank_name', a.bank_name,
    'bank_account_number', a.bank_account_number,
    'bank_account_last4', case
      when length(regexp_replace(coalesce(a.bank_account_number, ''), '\D', '', 'g')) >= 4
      then right(regexp_replace(a.bank_account_number, '\D', '', 'g'), 4)
      else null
    end,
    'phone', a.phone,
    'commission_amount', coalesce(a.commission_amount, public.get_agent_commission_amount()),
    'created_at', a.created_at,
    'approved_at', a.approved_at,
    'total_count', 1
  )
  into v_agent
  from public.agents a
  join public.profiles p on p.id = a.user_id
  left join auth.users u on u.id = a.user_id
  left join lateral (
    select
      count(*) filter (where ac.status <> 'cancelled') as total_sales,
      sum(ac.amount) filter (where ac.status <> 'cancelled') as total_commission,
      sum(ac.amount) filter (where ac.status = 'eligible' or (ac.status = 'pending_14_days' and ac.eligible_at <= now())) as eligible_commission,
      sum(ac.amount) filter (where ac.status = 'paid') as paid_commission
    from public.agent_commissions ac
    where ac.agent_id = a.id
  ) stats on true
  where a.id = p_agent_id;

  if v_agent is null then
    raise exception 'DIAMOND_AGENT_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ac.id,
      'buyer_name', coalesce(p.display_name, p.full_name),
      'buyer_email_masked', public.mask_email_for_agent(u.email),
      'payment_confirmed_at', ac.payment_confirmed_at,
      'eligible_at', ac.eligible_at,
      'paid_at', ac.paid_at,
      'amount', ac.amount,
      'status', ac.status,
      'effective_status', public.get_effective_commission_status(ac.status, ac.eligible_at)
    )
    order by ac.payment_confirmed_at desc
  ), '[]'::jsonb)
  into v_commissions
  from public.agent_commissions ac
  left join public.profiles p on p.id = ac.buyer_user_id
  left join auth.users u on u.id = ac.buyer_user_id
  where ac.agent_id = p_agent_id;

  return jsonb_build_object('agent', v_agent, 'commissions', v_commissions);
end;
$$;

create or replace function public.admin_approve_diamond_partner(p_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_agent public.agents%rowtype;
  v_code text;
begin
  select *
  into v_agent
  from public.agents
  where id = p_agent_id
  for update;

  if v_agent.id is null then
    raise exception 'DIAMOND_AGENT_NOT_FOUND';
  end if;

  v_code := coalesce(public.normalize_referral_code(v_agent.referral_code), public.generate_agent_referral_code(v_agent.id));

  update public.agents
  set
    status = 'active',
    referral_code = v_code,
    approved_at = now(),
    approved_by = v_admin_id,
    commission_amount = coalesce(commission_amount, public.get_agent_commission_amount()),
    updated_at = now()
  where id = p_agent_id
  returning * into v_agent;

  perform public.write_admin_audit(v_admin_id, v_agent.user_id, 'agent_approved', jsonb_build_object('agent_id', v_agent.id, 'referral_code', v_code));

  return public.diamond_profile_json(v_agent);
end;
$$;

create or replace function public.admin_reject_diamond_partner(p_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_agent public.agents%rowtype;
begin
  update public.agents
  set
    status = 'not_agent',
    updated_at = now()
  where id = p_agent_id
    and status = 'pending'
  returning * into v_agent;

  if v_agent.id is null then
    raise exception 'DIAMOND_AGENT_NOT_FOUND';
  end if;

  perform public.write_admin_audit(v_admin_id, v_agent.user_id, 'agent_rejected', jsonb_build_object('agent_id', v_agent.id));

  return public.diamond_profile_json(v_agent);
end;
$$;

create or replace function public.admin_suspend_diamond_partner(p_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_agent public.agents%rowtype;
begin
  update public.agents
  set
    status = 'suspended',
    updated_at = now()
  where id = p_agent_id
    and status = 'active'
  returning * into v_agent;

  if v_agent.id is null then
    raise exception 'DIAMOND_AGENT_NOT_FOUND';
  end if;

  perform public.write_admin_audit(v_admin_id, v_agent.user_id, 'agent_suspended', jsonb_build_object('agent_id', v_agent.id));

  return public.diamond_profile_json(v_agent);
end;
$$;

create or replace function public.admin_reactivate_diamond_partner(p_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_agent public.agents%rowtype;
  v_code text;
begin
  select *
  into v_agent
  from public.agents
  where id = p_agent_id
  for update;

  if v_agent.id is null or v_agent.status <> 'suspended' then
    raise exception 'DIAMOND_AGENT_NOT_FOUND';
  end if;

  v_code := coalesce(public.normalize_referral_code(v_agent.referral_code), public.generate_agent_referral_code(v_agent.id));

  update public.agents
  set
    status = 'active',
    referral_code = v_code,
    approved_at = coalesce(approved_at, now()),
    approved_by = coalesce(approved_by, v_admin_id),
    updated_at = now()
  where id = p_agent_id
  returning * into v_agent;

  perform public.write_admin_audit(v_admin_id, v_agent.user_id, 'agent_reactivated', jsonb_build_object('agent_id', v_agent.id, 'referral_code', v_code));

  return public.diamond_profile_json(v_agent);
end;
$$;

create or replace function public.admin_mark_agent_commission_paid(p_commission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_commission public.agent_commissions%rowtype;
begin
  select *
  into v_commission
  from public.agent_commissions
  where id = p_commission_id
  for update;

  if v_commission.id is null then
    raise exception 'COMMISSION_NOT_FOUND';
  end if;

  if v_commission.status = 'paid' then
    return jsonb_build_object('ok', true, 'id', v_commission.id, 'status', 'paid', 'idempotent', true);
  end if;

  if v_commission.status = 'cancelled' then
    raise exception 'COMMISSION_CANCELLED';
  end if;

  if v_commission.eligible_at > now() then
    raise exception 'COMMISSION_NOT_ELIGIBLE';
  end if;

  update public.agent_commissions
  set
    status = 'paid',
    paid_at = now()
  where id = p_commission_id
  returning * into v_commission;

  perform public.write_admin_audit(v_admin_id, v_commission.buyer_user_id, 'commission_paid', jsonb_build_object('commission_id', v_commission.id, 'agent_id', v_commission.agent_id, 'amount', v_commission.amount));

  return jsonb_build_object('ok', true, 'id', v_commission.id, 'status', 'paid', 'paid_at', v_commission.paid_at);
end;
$$;

revoke all on function public.generate_agent_referral_code(uuid) from public;
revoke all on function public.diamond_profile_json(public.agents) from public;

grant execute on function public.get_my_diamond_profile() to authenticated;
grant execute on function public.apply_for_diamond(text, text, text, text, boolean) to authenticated;
grant execute on function public.update_my_diamond_bank_info(text, text, text, text) to authenticated;
grant execute on function public.track_referral_click(text) to anon, authenticated;
grant execute on function public.get_my_diamond_dashboard() to authenticated;
grant execute on function public.admin_list_diamond_partners(text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_diamond_partner(uuid) to authenticated;
grant execute on function public.admin_approve_diamond_partner(uuid) to authenticated;
grant execute on function public.admin_reject_diamond_partner(uuid) to authenticated;
grant execute on function public.admin_suspend_diamond_partner(uuid) to authenticated;
grant execute on function public.admin_reactivate_diamond_partner(uuid) to authenticated;
grant execute on function public.admin_mark_agent_commission_paid(uuid) to authenticated;
