-- Enable Bahagian C essay writing without AI marking.
-- Run after commercial access migration. It also works after the PDF import migration.

alter table public.questions add column if not exists essay_min_words integer;
alter table public.questions add column if not exists essay_time_limit integer;
alter table public.questions add column if not exists archived_at timestamptz;

insert into public.question_sources (code, title, source_type, source_note)
values (
  'bahagian-c-fasa1',
  'Bahagian C Fasa 1',
  'manual',
  'Starter essay prompts for PKSK writing flow.'
)
on conflict (code) do update set
  title = excluded.title,
  source_note = excluded.source_note
returning id;

with source_row as (
  select id from public.question_sources where code = 'bahagian-c-fasa1'
),
essay_prompts as (
  select *
  from (
    values
      ('bahagian-c-fasa1-01', 'Amalan membaca banyak membantu murid menjadi lebih berjaya. Tulis sebuah karangan tentang faedah amalan membaca dalam kehidupan murid.', 'Amalan Membaca'),
      ('bahagian-c-fasa1-02', 'Disiplin diri sangat penting untuk mencapai kejayaan. Huraikan cara-cara murid Tahun 6 boleh membina disiplin diri yang baik.', 'Disiplin Diri'),
      ('bahagian-c-fasa1-03', 'Sekolah yang ceria dapat meningkatkan semangat belajar. Cadangkan aktiviti yang boleh dilakukan oleh murid untuk menceriakan kawasan sekolah.', 'Sekolah Ceria'),
      ('bahagian-c-fasa1-04', 'Penggunaan teknologi perlu dibuat dengan bijak. Tulis karangan tentang cara menggunakan telefon pintar atau internet secara bertanggungjawab.', 'Teknologi Bijak'),
      ('bahagian-c-fasa1-05', 'Sikap bekerjasama menjadikan sesuatu tugasan lebih mudah. Ceritakan pengalaman kamu bekerjasama dengan rakan-rakan untuk menjayakan satu aktiviti.', 'Kerjasama'),
      ('bahagian-c-fasa1-06', 'Kesihatan diri perlu dijaga sejak kecil. Huraikan langkah-langkah menjaga kesihatan fizikal dan mental sebagai seorang murid.', 'Kesihatan Diri')
  ) as prompt(source_key, question_text, topic)
)
insert into public.questions (
  source_id,
  source_key,
  question_type,
  section,
  category,
  topic,
  difficulty,
  question_text,
  explanation,
  is_active,
  essay_min_words,
  essay_time_limit
)
select
  source_row.id,
  essay_prompts.source_key,
  'essay',
  'C',
  'Penulisan',
  essay_prompts.topic,
  'medium',
  essay_prompts.question_text,
  'AI marking akan ditambah pada versi akan datang.',
  true,
  80,
  30
from source_row
cross join essay_prompts
on conflict (source_key) do update set
  question_text = excluded.question_text,
  topic = excluded.topic,
  explanation = excluded.explanation,
  is_active = true,
  essay_min_words = excluded.essay_min_words,
  essay_time_limit = excluded.essay_time_limit;

create or replace function public.count_words(input_text text)
returns integer
language sql
immutable
as $$
  select case
    when btrim(coalesce(input_text, '')) = '' then 0
    else array_length(regexp_split_to_array(btrim(regexp_replace(input_text, '\s+', ' ', 'g')), '\s+'), 1)
  end;
$$;

create or replace function public.start_essay_attempt()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt_id uuid;
  v_question_id uuid;
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

  select q.id into v_question_id
  from public.questions q
  where q.is_active = true
    and q.question_type = 'essay'
    and q.section = 'C'
    and q.archived_at is null
  order by random()
  limit 1;

  if v_question_id is null then
    raise exception 'EMPTY_ESSAY_BANK';
  end if;

  insert into public.quiz_attempts (
    user_id,
    mode,
    section,
    total_questions,
    correct_answers,
    score,
    percentage,
    xp_earned,
    status
  )
  values (
    v_user_id,
    'section',
    'C',
    1,
    0,
    0,
    0,
    0,
    'in_progress'
  )
  returning id into v_attempt_id;

  insert into public.attempt_questions (attempt_id, question_id, question_order)
  values (v_attempt_id, v_question_id, 1);

  insert into public.essay_responses (attempt_id, question_id, response_text, word_count)
  values (v_attempt_id, v_question_id, '', 0)
  on conflict (attempt_id, question_id) do nothing;

  return v_attempt_id;
end;
$$;

create or replace function public.get_essay_attempt_payload(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_payload jsonb;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', qa.id,
      'mode', qa.mode,
      'section', qa.section,
      'status', qa.status,
      'started_at', qa.started_at,
      'completed_at', qa.completed_at,
      'duration_seconds', qa.duration_seconds
    ),
    'question', jsonb_build_object(
      'id', q.id,
      'section', q.section,
      'category', q.category,
      'topic', q.topic,
      'difficulty', q.difficulty,
      'question_text', q.question_text,
      'question_image_url', q.question_image_url,
      'essay_min_words', q.essay_min_words,
      'essay_time_limit', q.essay_time_limit
    ),
    'response', jsonb_build_object(
      'response_text', coalesce(er.response_text, ''),
      'word_count', coalesce(er.word_count, 0),
      'autosaved_at', er.autosaved_at,
      'submitted_at', er.submitted_at
    )
  )
  into v_payload
  from public.quiz_attempts qa
  join public.attempt_questions aq on aq.attempt_id = qa.id
  join public.questions q on q.id = aq.question_id
  left join public.essay_responses er on er.attempt_id = qa.id and er.question_id = q.id
  where qa.id = p_attempt_id
    and qa.user_id = v_user_id
    and qa.section = 'C'
    and q.question_type = 'essay'
  limit 1;

  if v_payload is null then
    raise exception 'ESSAY_ATTEMPT_NOT_FOUND';
  end if;

  return v_payload;
end;
$$;

create or replace function public.fetch_active_essay_attempt()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempt_id uuid;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select qa.id into v_attempt_id
  from public.quiz_attempts qa
  join public.attempt_questions aq on aq.attempt_id = qa.id
  join public.questions q on q.id = aq.question_id
  where qa.user_id = v_user_id
    and qa.status = 'in_progress'
    and qa.section = 'C'
    and q.question_type = 'essay'
  order by qa.started_at desc
  limit 1;

  return v_attempt_id;
end;
$$;

create or replace function public.autosave_essay_response(
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
  v_question_id uuid;
  v_word_count integer := public.count_words(p_response_text);
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  select aq.question_id into v_question_id
  from public.quiz_attempts qa
  join public.attempt_questions aq on aq.attempt_id = qa.id
  join public.questions q on q.id = aq.question_id
  where qa.id = p_attempt_id
    and qa.user_id = v_user_id
    and qa.status = 'in_progress'
    and qa.section = 'C'
    and q.question_type = 'essay'
  limit 1;

  if v_question_id is null then
    raise exception 'ESSAY_ATTEMPT_NOT_FOUND';
  end if;

  insert into public.essay_responses (
    attempt_id,
    question_id,
    response_text,
    word_count,
    autosaved_at
  )
  values (
    p_attempt_id,
    v_question_id,
    coalesce(p_response_text, ''),
    v_word_count,
    now()
  )
  on conflict (attempt_id, question_id)
  do update set
    response_text = excluded.response_text,
    word_count = excluded.word_count,
    autosaved_at = excluded.autosaved_at;

  return jsonb_build_object(
    'saved', true,
    'word_count', v_word_count,
    'autosaved_at', now()
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
  v_word_count integer;
  v_duration integer;
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
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

  perform public.autosave_essay_response(p_attempt_id, p_response_text);

  select er.word_count into v_word_count
  from public.essay_responses er
  where er.attempt_id = p_attempt_id
  limit 1;

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

grant execute on function public.count_words(text) to anon, authenticated;
grant execute on function public.start_essay_attempt() to authenticated;
grant execute on function public.get_essay_attempt_payload(uuid) to authenticated;
grant execute on function public.fetch_active_essay_attempt() to authenticated;
grant execute on function public.autosave_essay_response(uuid, text) to authenticated;
grant execute on function public.submit_essay_response(uuid, text) to authenticated;
