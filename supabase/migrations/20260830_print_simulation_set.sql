create or replace function public.generate_print_simulation_set()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_section_a_count integer;
  v_section_b_count integer;
  v_section_c_count integer;
  v_payload jsonb;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if not public.is_premium_user(v_user_id) then
    if exists (select 1 from public.profiles where id = v_user_id and (is_blocked = true or subscription_status = 'blocked')) then
      raise exception 'ACCOUNT_BLOCKED';
    end if;
    raise exception 'PREMIUM_REQUIRED';
  end if;

  select count(*)::integer into v_section_a_count
  from public.questions q
  where q.is_active = true
    and q.question_type = 'objective'
    and q.section = 'A'
    and q.archived_at is null;

  select count(*)::integer into v_section_b_count
  from public.questions q
  where q.is_active = true
    and q.question_type = 'objective'
    and q.section = 'B'
    and q.archived_at is null;

  select count(*)::integer into v_section_c_count
  from public.questions q
  where q.is_active = true
    and q.question_type = 'essay'
    and q.section = 'C'
    and q.archived_at is null;

  if v_section_a_count < 30 then
    raise exception 'NOT_ENOUGH_SECTION_A_QUESTIONS';
  end if;

  if v_section_b_count < 70 then
    raise exception 'NOT_ENOUGH_SECTION_B_QUESTIONS';
  end if;

  if v_section_c_count < 1 then
    raise exception 'NOT_ENOUGH_SECTION_C_QUESTIONS';
  end if;

  with selected_a as (
    select id, row_number() over (order by random())::integer as question_order
    from (
      select q.id
      from public.questions q
      where q.is_active = true
        and q.question_type = 'objective'
        and q.section = 'A'
        and q.archived_at is null
      order by random()
      limit 30
    ) picked_a
  ),
  selected_b as (
    select id, (30 + row_number() over (order by random()))::integer as question_order
    from (
      select q.id
      from public.questions q
      where q.is_active = true
        and q.question_type = 'objective'
        and q.section = 'B'
        and q.archived_at is null
      order by random()
      limit 70
    ) picked_b
  ),
  selected_c as (
    select q.id, 101 as question_order
    from public.questions q
    where q.is_active = true
      and q.question_type = 'essay'
      and q.section = 'C'
      and q.archived_at is null
    order by random()
    limit 1
  ),
  selected_questions as (
    select id, question_order from selected_a
    union all
    select id, question_order from selected_b
    union all
    select id, question_order from selected_c
  ),
  randomized_options as (
    select
      qo.question_id,
      qo.id,
      qo.option_text,
      qo.option_image_url,
      row_number() over (partition by qo.question_id order by random())::integer as option_order
    from public.question_options qo
    join selected_questions sq on sq.id = qo.question_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'total_questions', 101,
    'sections', jsonb_build_object('A', 30, 'B', 70, 'C', 1),
    'questions', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'section', q.section,
          'category', q.category,
          'topic', q.topic,
          'difficulty', q.difficulty,
          'question_text', q.question_text,
          'question_image_url', q.question_image_url,
          'question_order', sq.question_order,
          'options', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', ro.id,
                  'option_text', ro.option_text,
                  'option_image_url', ro.option_image_url,
                  'option_order', ro.option_order
                )
                order by ro.option_order
              ),
              '[]'::jsonb
            )
            from randomized_options ro
            where ro.question_id = q.id
          ),
          'selected_option_id', null
        )
        order by sq.question_order
      ),
      '[]'::jsonb
    )
  )
  into v_payload
  from selected_questions sq
  join public.questions q on q.id = sq.id;

  return v_payload;
end;
$$;

grant execute on function public.generate_print_simulation_set() to authenticated;
