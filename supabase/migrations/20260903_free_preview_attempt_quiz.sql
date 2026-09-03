insert into public.app_settings (key, value, description)
values
  ('free_preview_section_a_limit', '5'::jsonb, 'Jumlah soalan Bahagian A yang dibuka dalam preview percuma.'),
  ('free_preview_section_b_limit', '10'::jsonb, 'Jumlah soalan Bahagian B yang dibuka dalam preview percuma.'),
  ('free_preview_section_c_enabled', 'false'::jsonb, 'Bahagian C dikunci untuk preview percuma.')
on conflict (key) do update
set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();

create or replace function public.start_free_preview_quiz()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt_id uuid;
  v_role text;
  v_is_blocked boolean;
  v_can_receive_marketing boolean;
  v_section_a_available integer;
  v_section_b_available integer;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select
    coalesce(p.role, 'user'),
    coalesce(p.is_blocked, false) or coalesce(p.subscription_status, 'free') = 'blocked',
    coalesce(p.marketing_consent, false) = true
      and p.marketing_consent_revoked_at is null
      and p.email_marketing_unsubscribed_at is null
  into v_role, v_is_blocked, v_can_receive_marketing
  from public.profiles p
  where p.id = v_user_id;

  if v_role is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_is_blocked then
    raise exception 'ACCOUNT_BLOCKED';
  end if;

  if v_role not in ('admin', 'super_admin') and not coalesce(v_can_receive_marketing, false) then
    raise exception 'MARKETING_CONSENT_REQUIRED';
  end if;

  select count(*)::integer
  into v_section_a_available
  from public.questions q
  where q.is_active = true
    and q.question_type = 'objective'
    and q.section = 'A'
    and q.archived_at is null;

  if v_section_a_available < 5 then
    raise exception 'NOT_ENOUGH_FREE_PREVIEW_SECTION_A_QUESTIONS';
  end if;

  select count(*)::integer
  into v_section_b_available
  from public.questions q
  where q.is_active = true
    and q.question_type = 'objective'
    and q.section = 'B'
    and q.archived_at is null;

  if v_section_b_available < 10 then
    raise exception 'NOT_ENOUGH_FREE_PREVIEW_SECTION_B_QUESTIONS';
  end if;

  insert into public.quiz_attempts (user_id, mode, section, status, total_questions)
  values (v_user_id, 'quick', null, 'in_progress', 15)
  returning id into v_attempt_id;

  with selected_a as (
    select q.id, row_number() over (order by random())::integer as question_order
    from (
      select q.id
      from public.questions q
      where q.is_active = true
        and q.question_type = 'objective'
        and q.section = 'A'
        and q.archived_at is null
      order by random()
      limit 5
    ) q
  ),
  selected_b as (
    select q.id, (5 + row_number() over (order by random()))::integer as question_order
    from (
      select q.id
      from public.questions q
      where q.is_active = true
        and q.question_type = 'objective'
        and q.section = 'B'
        and q.archived_at is null
      order by random()
      limit 10
    ) q
  ),
  ordered_questions as (
    select id, question_order from selected_a
    union all
    select id, question_order from selected_b
  ),
  inserted_questions as (
    insert into public.attempt_questions (attempt_id, question_id, question_order)
    select v_attempt_id, id, question_order
    from ordered_questions
    order by question_order
    returning id, question_id
  ),
  randomized_options as (
    select
      iq.id as attempt_question_id,
      qo.id as option_id,
      row_number() over (partition by iq.id order by random())::integer as option_order
    from inserted_questions iq
    join public.question_options qo on qo.question_id = iq.question_id
  )
  insert into public.attempt_question_options (attempt_question_id, option_id, option_order)
  select attempt_question_id, option_id, option_order
  from randomized_options;

  return v_attempt_id;
end;
$$;

grant execute on function public.start_free_preview_quiz() to authenticated;
