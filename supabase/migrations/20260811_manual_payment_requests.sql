create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  amount numeric(10,2) not null default 49.00,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  provider text not null default 'manual_whatsapp',
  notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_requests_user_status on public.payment_requests (user_id, status, created_at desc);
create index if not exists idx_payment_requests_status_created on public.payment_requests (status, created_at desc);
create index if not exists idx_payment_requests_email on public.payment_requests (lower(email));

drop trigger if exists payment_requests_touch_updated_at on public.payment_requests;
create trigger payment_requests_touch_updated_at
before update on public.payment_requests
for each row execute function public.touch_updated_at();

alter table public.payment_requests enable row level security;

drop policy if exists "payment requests user select own" on public.payment_requests;
create policy "payment requests user select own"
on public.payment_requests for select
to authenticated
using (user_id = auth.uid());

insert into public.app_settings (key, value, description)
values
  ('payment_provider', '"manual_whatsapp"'::jsonb, 'Provider bayaran aktif. MVP menggunakan QR DuitNow + WhatsApp.'),
  ('payment_price', '49'::jsonb, 'Harga Premium PKSK Academy.'),
  ('payment_currency', '"MYR"'::jsonb, 'Mata wang bayaran Premium.'),
  ('payment_plan_code', '"lifetime"'::jsonb, 'Pelan yang diberi selepas bayaran manual diluluskan.'),
  ('payment_whatsapp_number', '"60197259548"'::jsonb, 'Nombor WhatsApp admin untuk pengesahan bayaran.'),
  ('payment_account_name', '"PESONA STORE"'::jsonb, 'Nama penerima bayaran.'),
  ('payment_bank_name', '"Maybank"'::jsonb, 'Nama bank penerima.'),
  ('payment_account_number', '"551146529325"'::jsonb, 'Nombor akaun penerima.'),
  ('payment_qr_image_url', '"/assets/duitnow-qr-pesona-store.png"'::jsonb, 'QR DuitNow untuk bayaran manual.')
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

  insert into public.payment_requests (user_id, email, amount, status, provider, notes)
  values (v_user_id, v_email, v_amount, 'pending', 'manual_whatsapp', 'DuitNow QR + WhatsApp MVP')
  returning id into v_request_id;

  return jsonb_build_object(
    'id', v_request_id,
    'user_id', v_user_id,
    'email', v_email,
    'amount', v_amount,
    'status', 'pending'
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
    'status', pr.status,
    'provider', pr.provider,
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
  status text,
  provider text,
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
      pr.status,
      pr.provider,
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
grant execute on function public.admin_list_payment_requests(text, text, integer, integer) to authenticated;
grant execute on function public.admin_update_payment_request(uuid, text, text) to authenticated;
