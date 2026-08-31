alter table public.attempt_answers
add column if not exists revealed_at timestamptz;

create or replace function public.submit_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_correct boolean;
  v_valid boolean;
  v_revealed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select exists (
    select 1
    from public.quiz_attempts qa
    join public.attempt_questions aq on aq.attempt_id = qa.id
    join public.attempt_question_options aqo on aqo.attempt_question_id = aq.id
    join public.question_options qo on qo.id = aqo.option_id
    where qa.id = p_attempt_id
      and qa.user_id = v_user_id
      and qa.status = 'in_progress'
      and aq.question_id = p_question_id
      and qo.id = p_selected_option_id
  ) into v_valid;

  if not v_valid then
    raise exception 'INVALID_ANSWER';
  end if;

  select aa.revealed_at into v_revealed_at
  from public.attempt_answers aa
  where aa.attempt_id = p_attempt_id
    and aa.question_id = p_question_id;

  if v_revealed_at is not null then
    raise exception 'ANSWER_ALREADY_REVEALED';
  end if;

  select is_correct into v_is_correct
  from public.question_options
  where id = p_selected_option_id;

  insert into public.attempt_answers (attempt_id, question_id, selected_option_id, is_correct, answered_at)
  values (p_attempt_id, p_question_id, p_selected_option_id, v_is_correct, now())
  on conflict (attempt_id, question_id)
  do update set
    selected_option_id = excluded.selected_option_id,
    is_correct = excluded.is_correct,
    answered_at = excluded.answered_at;

  return jsonb_build_object('saved', true);
end;
$$;

create or replace function public.skip_answer(
  p_attempt_id uuid,
  p_question_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_valid boolean;
  v_revealed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select exists (
    select 1
    from public.quiz_attempts qa
    join public.attempt_questions aq on aq.attempt_id = qa.id
    where qa.id = p_attempt_id
      and qa.user_id = v_user_id
      and qa.status = 'in_progress'
      and aq.question_id = p_question_id
  ) into v_valid;

  if not v_valid then
    raise exception 'INVALID_ANSWER';
  end if;

  select aa.revealed_at into v_revealed_at
  from public.attempt_answers aa
  where aa.attempt_id = p_attempt_id
    and aa.question_id = p_question_id;

  if v_revealed_at is not null then
    raise exception 'ANSWER_ALREADY_REVEALED';
  end if;

  insert into public.attempt_answers (attempt_id, question_id, selected_option_id, is_correct, answered_at)
  values (p_attempt_id, p_question_id, null, false, now())
  on conflict (attempt_id, question_id)
  do update set
    selected_option_id = null,
    is_correct = false,
    answered_at = excluded.answered_at;

  return jsonb_build_object('saved', true, 'answer_status', 'skipped');
end;
$$;

create or replace function public.reveal_attempt_question_answer(
  p_attempt_id uuid,
  p_question_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt_question_id uuid;
  v_explanation text;
  v_answer public.attempt_answers%rowtype;
  v_correct_option_id uuid;
  v_correct_option_text text;
  v_correct_option_image_url text;
  v_correct_option_order integer;
  v_revealed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select aq.id, q.explanation
  into v_attempt_question_id, v_explanation
  from public.quiz_attempts qa
  join public.attempt_questions aq on aq.attempt_id = qa.id
  join public.questions q on q.id = aq.question_id
  where qa.id = p_attempt_id
    and qa.user_id = v_user_id
    and qa.status = 'in_progress'
    and aq.question_id = p_question_id
  limit 1;

  if v_attempt_question_id is null then
    raise exception 'ATTEMPT_QUESTION_NOT_FOUND';
  end if;

  select * into v_answer
  from public.attempt_answers aa
  where aa.attempt_id = p_attempt_id
    and aa.question_id = p_question_id;

  if v_answer.id is null then
    raise exception 'ANSWER_REQUIRED';
  end if;

  select qo.id, qo.option_text, qo.option_image_url, aqo.option_order
  into v_correct_option_id, v_correct_option_text, v_correct_option_image_url, v_correct_option_order
  from public.attempt_question_options aqo
  join public.question_options qo on qo.id = aqo.option_id
  where aqo.attempt_question_id = v_attempt_question_id
    and qo.is_correct = true
  order by aqo.option_order
  limit 1;

  if v_correct_option_id is null then
    raise exception 'CORRECT_OPTION_NOT_FOUND';
  end if;

  update public.attempt_answers
  set revealed_at = coalesce(revealed_at, now())
  where id = v_answer.id
  returning revealed_at into v_revealed_at;

  return jsonb_build_object(
    'question_id', p_question_id,
    'selected_option_id', v_answer.selected_option_id,
    'correct_option_id', v_correct_option_id,
    'correct_option_text', v_correct_option_text,
    'correct_option_image_url', v_correct_option_image_url,
    'correct_option_order', v_correct_option_order,
    'is_correct', coalesce(v_answer.is_correct, false),
    'answer_status', case when v_answer.selected_option_id is null then 'skipped' else 'answered' end,
    'answer_revealed_at', v_revealed_at,
    'explanation', v_explanation
  );
end;
$$;

create or replace function public.get_attempt_payload(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner uuid;
  v_payload jsonb;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select user_id into v_owner
  from public.quiz_attempts
  where id = p_attempt_id;

  if v_owner is null or v_owner <> v_user_id then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', qa.id,
      'mode', qa.mode,
      'section', qa.section,
      'status', qa.status,
      'started_at', qa.started_at,
      'completed_at', qa.completed_at,
      'total_questions', qa.total_questions,
      'correct_answers', qa.correct_answers,
      'percentage', qa.percentage,
      'xp_earned', qa.xp_earned
    ),
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
          'question_order', aq.question_order,
          'options', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'id', qo.id,
                'option_text', qo.option_text,
                'option_image_url', qo.option_image_url,
                'option_order', aqo.option_order
              )
              order by aqo.option_order
            ), '[]'::jsonb)
            from public.attempt_question_options aqo
            join public.question_options qo on qo.id = aqo.option_id
            where aqo.attempt_question_id = aq.id
          ),
          'selected_option_id', aa.selected_option_id,
          'answer_status', case
            when aa.id is null then 'unanswered'
            when aa.selected_option_id is null then 'skipped'
            else 'answered'
          end,
          'answer_revealed_at', aa.revealed_at,
          'correct_option_id', case
            when aa.revealed_at is not null then (
              select qo.id
              from public.attempt_question_options aqo
              join public.question_options qo on qo.id = aqo.option_id
              where aqo.attempt_question_id = aq.id
                and qo.is_correct = true
              order by aqo.option_order
              limit 1
            )
            else null
          end,
          'answer_explanation', case when aa.revealed_at is not null then q.explanation else null end
        )
        order by
          case q.section when 'A' then 1 when 'B' then 2 else 3 end,
          aq.question_order
      ) filter (where q.id is not null),
      '[]'::jsonb
    )
  )
  into v_payload
  from public.quiz_attempts qa
  left join public.attempt_questions aq on aq.attempt_id = qa.id
  left join public.questions q on q.id = aq.question_id
  left join public.attempt_answers aa on aa.attempt_id = qa.id and aa.question_id = q.id
  where qa.id = p_attempt_id
  group by qa.id;

  return v_payload;
end;
$$;

grant execute on function public.submit_answer(uuid, uuid, uuid) to authenticated;
grant execute on function public.skip_answer(uuid, uuid) to authenticated;
grant execute on function public.reveal_attempt_question_answer(uuid, uuid) to authenticated;
grant execute on function public.get_attempt_payload(uuid) to authenticated;
