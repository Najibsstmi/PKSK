-- Simulator PKSK Supabase schema, RLS policies, RPC functions, and badge seed.
-- Copy and paste this file into Supabase SQL Editor, then run it once.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  display_name text,
  school text,
  state text,
  class_name text,
  avatar text,
  xp integer not null default 0,
  level integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_sources (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  source_type text not null default 'pdf',
  source_note text,
  imported_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.question_sources(id) on delete set null,
  source_key text unique,
  question_type text not null default 'objective' check (question_type in ('objective', 'essay')),
  section text not null check (section in ('A', 'B', 'C')),
  category text,
  topic text,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  question_text text not null,
  question_image_url text,
  explanation text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_label text,
  option_text text not null,
  is_correct boolean not null default false,
  sort_order integer not null default 0
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('full', 'section', 'quick')),
  section text check (section in ('A', 'B', 'C')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_questions integer not null default 0,
  correct_answers integer not null default 0,
  score numeric not null default 0,
  percentage numeric not null default 0,
  section_a_score numeric,
  section_b_score numeric,
  section_c_score numeric,
  duration_seconds integer,
  xp_earned integer not null default 0,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned'))
);

create table if not exists public.attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  question_order integer not null,
  unique (attempt_id, question_id),
  unique (attempt_id, question_order)
);

create table if not exists public.attempt_question_options (
  id uuid primary key default gen_random_uuid(),
  attempt_question_id uuid not null references public.attempt_questions(id) on delete cascade,
  option_id uuid not null references public.question_options(id),
  option_order integer not null,
  unique (attempt_question_id, option_id),
  unique (attempt_question_id, option_order)
);

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  selected_option_id uuid references public.question_options(id),
  is_correct boolean not null default false,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table if not exists public.essay_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  response_text text not null default '',
  word_count integer not null default 0,
  autosaved_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (attempt_id, question_id)
);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text not null,
  icon text not null,
  tier text not null check (tier in ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM')),
  xp_reward integer not null default 0,
  requirement_type text not null,
  requirement_value numeric not null,
  is_active boolean not null default true
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create table if not exists public.xp_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null,
  attempt_id uuid references public.quiz_attempts(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_questions_active_section on public.questions (is_active, section, question_type);
create index if not exists idx_question_options_question on public.question_options (question_id, sort_order);
create index if not exists idx_quiz_attempts_user_status on public.quiz_attempts (user_id, status, started_at desc);
create index if not exists idx_attempt_questions_attempt on public.attempt_questions (attempt_id, question_order);
create index if not exists idx_attempt_answers_attempt on public.attempt_answers (attempt_id);
create index if not exists idx_user_badges_user on public.user_badges (user_id);
create index if not exists idx_xp_history_user on public.xp_history (user_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists questions_touch_updated_at on public.questions;
create trigger questions_touch_updated_at
before update on public.questions
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create or replace function public.calculate_level(total_xp integer)
returns integer
language sql
immutable
as $$
  select greatest(1, floor(greatest(total_xp, 0) / 500)::integer + 1);
$$;

create or replace function public.next_level_xp(current_level integer)
returns integer
language sql
immutable
as $$
  select greatest(1, current_level) * 500;
$$;

alter table public.profiles enable row level security;
alter table public.question_sources enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.attempt_questions enable row level security;
alter table public.attempt_question_options enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.essay_responses enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.xp_history enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "questions select active" on public.questions;
create policy "questions select active"
on public.questions for select
to authenticated
using (is_active = true);

drop policy if exists "badges select active" on public.badges;
create policy "badges select active"
on public.badges for select
to authenticated
using (is_active = true);

drop policy if exists "quiz attempts select own" on public.quiz_attempts;
create policy "quiz attempts select own"
on public.quiz_attempts for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "quiz attempts update own" on public.quiz_attempts;
create policy "quiz attempts update own"
on public.quiz_attempts for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "attempt questions select own" on public.attempt_questions;
create policy "attempt questions select own"
on public.attempt_questions for select
to authenticated
using (
  exists (
    select 1 from public.quiz_attempts qa
    where qa.id = attempt_questions.attempt_id
      and qa.user_id = auth.uid()
  )
);

drop policy if exists "attempt question options select own" on public.attempt_question_options;
create policy "attempt question options select own"
on public.attempt_question_options for select
to authenticated
using (
  exists (
    select 1
    from public.attempt_questions aq
    join public.quiz_attempts qa on qa.id = aq.attempt_id
    where aq.id = attempt_question_options.attempt_question_id
      and qa.user_id = auth.uid()
  )
);

drop policy if exists "attempt answers select own" on public.attempt_answers;
create policy "attempt answers select own"
on public.attempt_answers for select
to authenticated
using (
  exists (
    select 1 from public.quiz_attempts qa
    where qa.id = attempt_answers.attempt_id
      and qa.user_id = auth.uid()
  )
);

drop policy if exists "essay responses select own" on public.essay_responses;
create policy "essay responses select own"
on public.essay_responses for select
to authenticated
using (
  exists (
    select 1 from public.quiz_attempts qa
    where qa.id = essay_responses.attempt_id
      and qa.user_id = auth.uid()
  )
);

drop policy if exists "user badges select own" on public.user_badges;
create policy "user badges select own"
on public.user_badges for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "xp history select own" on public.xp_history;
create policy "xp history select own"
on public.xp_history for select
to authenticated
using (user_id = auth.uid());

revoke all on public.question_options from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.questions to authenticated;
grant select on public.quiz_attempts to authenticated;
grant update on public.quiz_attempts to authenticated;
grant select on public.attempt_questions to authenticated;
grant select on public.attempt_question_options to authenticated;
grant select on public.attempt_answers to authenticated;
grant select on public.essay_responses to authenticated;
grant select on public.badges to authenticated;
grant select on public.user_badges to authenticated;
grant select on public.xp_history to authenticated;

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
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if p_mode not in ('full', 'section', 'quick') then
    raise exception 'INVALID_MODE';
  end if;

  if p_mode = 'section' and coalesce(p_section, '') not in ('A', 'B', 'C') then
    raise exception 'INVALID_SECTION';
  end if;

  v_limit := case
    when p_mode = 'full' then coalesce(nullif(p_number_of_questions, 0), 30)
    when p_mode = 'quick' then coalesce(nullif(p_number_of_questions, 0), 10)
    else coalesce(nullif(p_number_of_questions, 0), 10)
  end;
  v_limit := least(greatest(v_limit, 1), 100);

  insert into public.quiz_attempts (user_id, mode, section, status)
  values (v_user_id, p_mode, p_section, 'in_progress')
  returning id into v_attempt_id;

  with selected_questions as (
    select q.id
    from public.questions q
    where q.is_active = true
      and q.question_type = 'objective'
      and (
        (p_mode = 'full' and q.section in ('A', 'B'))
        or (p_mode = 'quick' and q.section in ('A', 'B'))
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

  select count(*) into v_count
  from public.attempt_questions
  where attempt_id = v_attempt_id;

  if v_count = 0 then
    delete from public.quiz_attempts where id = v_attempt_id;
    raise exception 'EMPTY_QUESTION_BANK';
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
          'question_order', aq.question_order,
          'options', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'id', qo.id,
                'option_text', qo.option_text,
                'option_order', aqo.option_order
              )
              order by aqo.option_order
            ), '[]'::jsonb)
            from public.attempt_question_options aqo
            join public.question_options qo on qo.id = aqo.option_id
            where aqo.attempt_question_id = aq.id
          ),
          'selected_option_id', aa.selected_option_id
        )
        order by aq.question_order
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
  v_percentage numeric;
  v_duration integer;
  v_xp integer;
  v_new_total_xp integer;
  v_new_level integer;
  v_section_a numeric;
  v_section_b numeric;
  v_section_c numeric;
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
      'percentage', v_attempt.percentage,
      'xp_earned', v_attempt.xp_earned,
      'already_completed', true
    );
  end if;

  select
    count(aq.id)::integer,
    count(aa.id) filter (where aa.is_correct)::integer
  into v_total, v_correct
  from public.attempt_questions aq
  left join public.attempt_answers aa
    on aa.attempt_id = aq.attempt_id
   and aa.question_id = aq.question_id
  where aq.attempt_id = p_attempt_id;

  if v_total = 0 then
    raise exception 'EMPTY_ATTEMPT';
  end if;

  if (select count(*) from public.attempt_answers where attempt_id = p_attempt_id) < v_total then
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

  v_xp := (v_correct * 10)
    + case when v_attempt.mode = 'quick' then 30 when v_attempt.mode = 'section' then 50 else 100 end
    + case when v_percentage >= 100 then 200 when v_percentage >= 90 then 100 when v_percentage >= 80 then 50 else 0 end;

  update public.quiz_attempts
  set
    completed_at = now(),
    total_questions = v_total,
    correct_answers = v_correct,
    score = v_correct,
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
    'percentage', v_percentage,
    'duration_seconds', v_duration,
    'xp_earned', v_xp,
    'total_xp', v_new_total_xp,
    'level', v_new_level,
    'section_a_score', v_section_a,
    'section_b_score', v_section_b,
    'section_c_score', v_section_c
  );
end;
$$;

grant execute on function public.start_quiz(text, text, integer) to authenticated;
grant execute on function public.get_attempt_payload(uuid) to authenticated;
grant execute on function public.submit_answer(uuid, uuid, uuid) to authenticated;
grant execute on function public.complete_attempt(uuid) to authenticated;

insert into public.badges (code, name, description, icon, tier, xp_reward, requirement_type, requirement_value)
values
  ('first_step', 'Langkah Pertama', 'Selesaikan simulasi pertama.', 'footprints', 'BRONZE', 20, 'completed_attempts', 1),
  ('quick_thinker', 'Pemikir Pantas', 'Selesaikan Cabaran Pantas pertama.', 'zap', 'BRONZE', 30, 'quick_attempts', 1),
  ('consistent_5', 'Pejuang Konsisten', 'Selesaikan 5 simulasi.', 'calendar-check', 'SILVER', 50, 'completed_attempts', 5),
  ('score_80', 'Bintang PKSK', 'Capai sekurang-kurangnya 80%.', 'star', 'SILVER', 50, 'score_percent', 80),
  ('score_90', 'Minda Cemerlang', 'Capai sekurang-kurangnya 90%.', 'sparkles', 'GOLD', 100, 'score_percent', 90),
  ('section_a_master', 'Insaniah Cemerlang', 'Capai 90% Bahagian A.', 'heart-handshake', 'GOLD', 100, 'section_a_percent', 90),
  ('section_b_master', 'Minda Tajam', 'Capai 90% Bahagian B.', 'brain', 'GOLD', 100, 'section_b_percent', 90),
  ('perfect_score', 'Perfect Run', 'Capai 100% dalam satu latihan.', 'trophy', 'PLATINUM', 200, 'score_percent', 100),
  ('pksk_master', 'PKSK Master', 'Capai milestone utama aplikasi.', 'crown', 'PLATINUM', 300, 'master_milestone', 10)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  tier = excluded.tier,
  xp_reward = excluded.xp_reward,
  requirement_type = excluded.requirement_type,
  requirement_value = excluded.requirement_value,
  is_active = true;
