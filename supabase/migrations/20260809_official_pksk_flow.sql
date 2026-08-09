-- Official PKSK flow:
-- Bahagian A: 30 objective questions, weighted to 20 marks.
-- Bahagian B: 70 objective questions, weighted to 70 marks.
-- Bahagian C: 1 essay prompt, 100 minimum words, 45 minutes.

update public.questions
set
  essay_min_words = 100,
  essay_time_limit = 45
where section = 'C'
  and question_type = 'essay';

create or replace function public.start_quiz(
  p_mode text,
  p_section text default null,
  p_number_of_questions integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt_id uuid;
  v_limit integer;
  v_count integer;
  v_section_a_count integer;
  v_section_b_count integer;
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

  if p_mode not in ('full', 'section', 'quick') then
    raise exception 'INVALID_MODE';
  end if;

  if p_mode = 'section' and coalesce(p_section, '') not in ('A', 'B') then
    raise exception 'INVALID_SECTION';
  end if;

  v_limit := case
    when p_mode = 'full' then 100
    when p_mode = 'quick' then coalesce(nullif(p_number_of_questions, 0), 10)
    when p_section = 'A' then coalesce(nullif(p_number_of_questions, 0), 30)
    when p_section = 'B' then coalesce(nullif(p_number_of_questions, 0), 70)
    else coalesce(nullif(p_number_of_questions, 0), 10)
  end;
  v_limit := least(greatest(v_limit, 1), 100);

  insert into public.quiz_attempts (user_id, mode, section, status)
  values (v_user_id, p_mode, case when p_mode = 'full' then null else p_section end, 'in_progress')
  returning id into v_attempt_id;

  if p_mode = 'full' then
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
  else
    with selected_questions as (
      select q.id
      from public.questions q
      where q.is_active = true
        and q.question_type = 'objective'
        and q.archived_at is null
        and (
          (p_mode = 'quick' and q.section in ('A', 'B'))
          or (p_mode = 'section' and q.section = p_section)
        )
      order by random()
      limit v_limit
    ),
    ordered_questions as (
      select id, row_number() over (order by random())::integer as question_order
      from selected_questions
    ),
    inserted_questions as (
      insert into public.attempt_questions (attempt_id, question_id, question_order)
      select v_attempt_id, id, question_order
      from ordered_questions
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
  end if;

  select
    count(*)::integer,
    (count(*) filter (where q.section = 'A'))::integer,
    (count(*) filter (where q.section = 'B'))::integer
  into v_count, v_section_a_count, v_section_b_count
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  where aq.attempt_id = v_attempt_id;

  if v_count = 0 then
    delete from public.quiz_attempts where id = v_attempt_id;
    raise exception 'EMPTY_QUESTION_BANK';
  end if;

  if p_mode = 'full' and v_section_a_count < 30 then
    delete from public.quiz_attempts where id = v_attempt_id;
    raise exception 'NOT_ENOUGH_SECTION_A_QUESTIONS';
  end if;

  if p_mode = 'full' and v_section_b_count < 70 then
    delete from public.quiz_attempts where id = v_attempt_id;
    raise exception 'NOT_ENOUGH_SECTION_B_QUESTIONS';
  end if;

  update public.quiz_attempts
  set total_questions = v_count
  where id = v_attempt_id;

  return v_attempt_id;
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
          end
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

create or replace function public.complete_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt public.quiz_attempts%rowtype;
  v_total integer;
  v_correct integer;
  v_answered_count integer;
  v_skipped_count integer;
  v_percentage numeric;
  v_duration integer;
  v_xp integer;
  v_new_total_xp integer;
  v_new_level integer;
  v_section_a numeric;
  v_section_b numeric;
  v_section_c numeric;
  v_section_a_weighted numeric := 0;
  v_section_b_weighted numeric := 0;
  v_score numeric := 0;
  v_completed_count integer;
  v_quick_count integer;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select * into v_attempt
  from public.quiz_attempts
  where id = p_attempt_id
    and user_id = v_user_id
  for update;

  if v_attempt.id is null then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  if v_attempt.status = 'completed' then
    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'correct_answers', v_attempt.correct_answers,
      'total_questions', v_attempt.total_questions,
      'score', v_attempt.score,
      'percentage', v_attempt.percentage,
      'xp_earned', v_attempt.xp_earned,
      'already_completed', true
    );
  end if;

  select
    count(aq.id)::integer,
    count(aa.id)::integer,
    count(aa.id) filter (where aa.is_correct)::integer,
    count(aa.id) filter (where aa.selected_option_id is null)::integer
  into v_total, v_answered_count, v_correct, v_skipped_count
  from public.attempt_questions aq
  left join public.attempt_answers aa
    on aa.attempt_id = aq.attempt_id
   and aa.question_id = aq.question_id
  where aq.attempt_id = p_attempt_id;

  if v_total = 0 then
    raise exception 'EMPTY_ATTEMPT';
  end if;

  if v_answered_count < v_total then
    raise exception 'ATTEMPT_NOT_FINISHED';
  end if;

  v_percentage := round((v_correct::numeric / v_total::numeric) * 100, 2);
  v_duration := extract(epoch from (now() - v_attempt.started_at))::integer;

  select round((count(aa.id) filter (where aa.is_correct)::numeric / nullif(count(aq.id), 0)::numeric) * 100, 2)
  into v_section_a
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  left join public.attempt_answers aa on aa.attempt_id = aq.attempt_id and aa.question_id = aq.question_id
  where aq.attempt_id = p_attempt_id and q.section = 'A';

  select round((count(aa.id) filter (where aa.is_correct)::numeric / nullif(count(aq.id), 0)::numeric) * 100, 2)
  into v_section_b
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  left join public.attempt_answers aa on aa.attempt_id = aq.attempt_id and aa.question_id = aq.question_id
  where aq.attempt_id = p_attempt_id and q.section = 'B';

  select round((count(aa.id) filter (where aa.is_correct)::numeric / nullif(count(aq.id), 0)::numeric) * 100, 2)
  into v_section_c
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  left join public.attempt_answers aa on aa.attempt_id = aq.attempt_id and aa.question_id = aq.question_id
  where aq.attempt_id = p_attempt_id and q.section = 'C';

  v_section_a_weighted := round((coalesce(v_section_a, 0) / 100) * 20, 2);
  v_section_b_weighted := round((coalesce(v_section_b, 0) / 100) * 70, 2);

  v_score := case
    when v_attempt.mode = 'full' then v_section_a_weighted + v_section_b_weighted
    when v_attempt.section = 'A' then v_section_a_weighted
    when v_attempt.section = 'B' then v_section_b_weighted
    else v_percentage
  end;

  v_xp := (v_correct * 10)
    + case when v_attempt.mode = 'quick' then 30 when v_attempt.mode = 'section' then 50 else 100 end
    + case when v_percentage >= 100 then 200 when v_percentage >= 90 then 100 when v_percentage >= 80 then 50 else 0 end;

  update public.quiz_attempts
  set
    completed_at = now(),
    total_questions = v_total,
    correct_answers = v_correct,
    score = v_score,
    percentage = v_percentage,
    section_a_score = v_section_a,
    section_b_score = v_section_b,
    section_c_score = v_section_c,
    duration_seconds = v_duration,
    xp_earned = v_xp,
    status = 'completed'
  where id = p_attempt_id;

  insert into public.xp_history (user_id, amount, reason, attempt_id)
  values (v_user_id, v_xp, 'Tamat latihan PKSK', p_attempt_id);

  update public.profiles
  set
    xp = xp + v_xp,
    level = public.calculate_level(xp + v_xp)
  where id = v_user_id
  returning xp, level into v_new_total_xp, v_new_level;

  select count(*) into v_completed_count
  from public.quiz_attempts
  where user_id = v_user_id and status = 'completed';

  select count(*) into v_quick_count
  from public.quiz_attempts
  where user_id = v_user_id and status = 'completed' and mode = 'quick';

  insert into public.user_badges (user_id, badge_id)
  select v_user_id, b.id
  from public.badges b
  where b.is_active = true
    and (
      (b.code = 'first_step' and v_completed_count >= 1)
      or (b.code = 'quick_thinker' and v_quick_count >= 1)
      or (b.code = 'consistent_5' and v_completed_count >= 5)
      or (b.code = 'score_80' and v_percentage >= 80)
      or (b.code = 'score_90' and v_percentage >= 90)
      or (b.code = 'section_a_master' and coalesce(v_section_a, 0) >= 90)
      or (b.code = 'section_b_master' and coalesce(v_section_b, 0) >= 90)
      or (b.code = 'perfect_score' and v_percentage >= 100)
      or (b.code = 'pksk_master' and (v_completed_count >= 10 or v_new_level >= 10))
    )
  on conflict (user_id, badge_id) do nothing;

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'correct_answers', v_correct,
    'total_questions', v_total,
    'score', v_score,
    'percentage', v_percentage,
    'duration_seconds', v_duration,
    'xp_earned', v_xp,
    'total_xp', v_new_total_xp,
    'level', v_new_level,
    'section_a_score', v_section_a,
    'section_b_score', v_section_b,
    'section_c_score', v_section_c,
    'section_a_weighted_score', v_section_a_weighted,
    'section_b_weighted_score', v_section_b_weighted,
    'skipped_answers', coalesce(v_skipped_count, 0)
  );
end;
$$;

create or replace function public.submit_essay_response(
  p_attempt_id uuid,
  p_response_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt public.quiz_attempts%rowtype;
  v_question_id uuid;
  v_min_words integer;
  v_word_count integer;
  v_duration integer;
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

  select * into v_attempt
  from public.quiz_attempts
  where id = p_attempt_id
    and user_id = v_user_id
    and section = 'C';

  if v_attempt.id is null then
    raise exception 'ESSAY_ATTEMPT_NOT_FOUND';
  end if;

  if v_attempt.status = 'completed' then
    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'already_submitted', true,
      'message', 'Karangan berjaya dihantar.',
      'ai_note', 'AI marking akan ditambah pada versi akan datang.'
    );
  end if;

  select aq.question_id, coalesce(q.essay_min_words, 100)
  into v_question_id, v_min_words
  from public.attempt_questions aq
  join public.questions q on q.id = aq.question_id
  where aq.attempt_id = p_attempt_id
    and q.section = 'C'
    and q.question_type = 'essay'
  limit 1;

  if v_question_id is null then
    raise exception 'ESSAY_ATTEMPT_NOT_FOUND';
  end if;

  perform public.autosave_essay_response(p_attempt_id, p_response_text);

  select er.word_count into v_word_count
  from public.essay_responses er
  where er.attempt_id = p_attempt_id
    and er.question_id = v_question_id
  limit 1;

  if coalesce(v_word_count, 0) < v_min_words then
    raise exception 'ESSAY_MIN_WORDS_REQUIRED';
  end if;

  v_duration := greatest(0, extract(epoch from (now() - v_attempt.started_at))::integer);

  update public.essay_responses
  set submitted_at = now()
  where attempt_id = p_attempt_id;

  update public.quiz_attempts
  set
    completed_at = now(),
    duration_seconds = v_duration,
    total_questions = 1,
    correct_answers = 0,
    score = 0,
    percentage = 0,
    section_c_score = 0,
    xp_earned = 0,
    status = 'completed'
  where id = p_attempt_id;

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'word_count', coalesce(v_word_count, 0),
    'duration_seconds', v_duration,
    'message', 'Karangan berjaya dihantar.',
    'ai_note', 'AI marking akan ditambah pada versi akan datang.'
  );
end;
$$;

grant execute on function public.start_quiz(text, text, integer) to authenticated;
grant execute on function public.get_attempt_payload(uuid) to authenticated;
grant execute on function public.skip_answer(uuid, uuid) to authenticated;
grant execute on function public.complete_attempt(uuid) to authenticated;
grant execute on function public.submit_essay_response(uuid, text) to authenticated;
