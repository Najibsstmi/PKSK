-- Performance scoreboards for premium users.
-- Adds read-only performance summaries and a verified storage point for Bahagian C AI marks.

create table if not exists public.essay_grading_results (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer_hash text not null,
  total_score numeric not null check (total_score >= 0 and total_score <= 100),
  pksk_estimated_score numeric,
  grading_level text,
  word_count integer not null default 0,
  grading_result jsonb not null default '{}'::jsonb,
  graded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id)
);

create index if not exists idx_essay_grading_results_user_score
on public.essay_grading_results (user_id, total_score desc, graded_at desc);

create index if not exists idx_essay_grading_results_attempt_question
on public.essay_grading_results (attempt_id, question_id);

drop trigger if exists essay_grading_results_touch_updated_at on public.essay_grading_results;
create trigger essay_grading_results_touch_updated_at
before update on public.essay_grading_results
for each row execute function public.touch_updated_at();

alter table public.essay_grading_results enable row level security;

drop policy if exists "essay grading results select own" on public.essay_grading_results;
create policy "essay grading results select own"
on public.essay_grading_results for select
to authenticated
using (user_id = auth.uid());

revoke all on public.essay_grading_results from anon, authenticated;
grant select on public.essay_grading_results to authenticated;
grant select, insert, update on public.essay_grading_results to service_role;

create or replace function public.get_my_performance_breakdown()
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
    raise exception 'LOGIN_REQUIRED';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_user_id) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and (coalesce(p.is_blocked, false) = true or coalesce(p.subscription_status, 'free') = 'blocked')
  ) then
    raise exception 'ACCOUNT_BLOCKED';
  end if;

  with raw_scores as (
    select
      qa.id as attempt_id,
      'A'::text as section,
      qa.section_a_score::numeric as percentage,
      qa.completed_at as achieved_at
    from public.quiz_attempts qa
    where qa.user_id = v_user_id
      and qa.status = 'completed'
      and qa.mode <> 'quick'
      and qa.completed_at is not null
      and qa.section_a_score is not null

    union all

    select
      qa.id as attempt_id,
      'B'::text as section,
      qa.section_b_score::numeric as percentage,
      qa.completed_at as achieved_at
    from public.quiz_attempts qa
    where qa.user_id = v_user_id
      and qa.status = 'completed'
      and qa.mode <> 'quick'
      and qa.completed_at is not null
      and qa.section_b_score is not null

    union all

    select
      qa.id as attempt_id,
      'C'::text as section,
      egr.total_score::numeric as percentage,
      coalesce(egr.graded_at, qa.completed_at) as achieved_at
    from public.quiz_attempts qa
    join public.essay_grading_results egr on egr.attempt_id = qa.id and egr.user_id = qa.user_id
    join public.essay_responses er on er.attempt_id = qa.id and er.question_id = egr.question_id
    where qa.user_id = v_user_id
      and qa.status = 'completed'
      and qa.section = 'C'
      and qa.completed_at is not null
      and er.submitted_at is not null
      and egr.answer_hash = md5(regexp_replace(btrim(coalesce(er.response_text, '')), '\s+', ' ', 'g'))
  ),
  valid_scores as (
    select *
    from raw_scores
    where percentage is not null
  ),
  aggregated as (
    select
      section,
      count(*)::integer as attempts,
      max(achieved_at) as latest_at
    from valid_scores
    group by section
  ),
  best_scores as (
    select distinct on (section)
      section,
      percentage,
      achieved_at
    from valid_scores
    order by section, percentage desc, achieved_at asc, attempt_id
  ),
  sections as (
    select *
    from (values ('A'::text, 1), ('B'::text, 2), ('C'::text, 3)) as section_order(section, sort_order)
  )
  select jsonb_build_object(
    'sections',
    jsonb_object_agg(
      sections.section,
      jsonb_build_object(
        'best_score', round(best_scores.percentage, 2),
        'attempts', coalesce(aggregated.attempts, 0),
        'latest_at', aggregated.latest_at
      )
    ),
    'completed_sections',
    count(best_scores.section)::integer,
    'overall_average',
    case
      when count(best_scores.section) = 3 then round(avg(best_scores.percentage), 2)
      else null
    end
  )
  into v_payload
  from sections
  left join aggregated on aggregated.section = sections.section
  left join best_scores on best_scores.section = sections.section;

  return coalesce(v_payload, jsonb_build_object(
    'sections', jsonb_build_object(
      'A', jsonb_build_object('best_score', null, 'attempts', 0, 'latest_at', null),
      'B', jsonb_build_object('best_score', null, 'attempts', 0, 'latest_at', null),
      'C', jsonb_build_object('best_score', null, 'attempts', 0, 'latest_at', null)
    ),
    'completed_sections', 0,
    'overall_average', null
  ));
end;
$$;

create or replace function public.get_section_leaderboard()
returns table (
  section text,
  rank integer,
  display_name text,
  percentage numeric,
  achieved_at timestamptz,
  is_current_user boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and (coalesce(p.is_blocked, false) = true or coalesce(p.subscription_status, 'free') = 'blocked')
  ) then
    raise exception 'ACCOUNT_BLOCKED';
  end if;

  return query
  with raw_scores as (
    select
      qa.id as attempt_id,
      qa.user_id,
      'A'::text as section,
      qa.section_a_score::numeric as percentage,
      qa.completed_at as achieved_at
    from public.quiz_attempts qa
    where qa.status = 'completed'
      and qa.mode <> 'quick'
      and qa.completed_at is not null
      and qa.section_a_score >= 60

    union all

    select
      qa.id as attempt_id,
      qa.user_id,
      'B'::text as section,
      qa.section_b_score::numeric as percentage,
      qa.completed_at as achieved_at
    from public.quiz_attempts qa
    where qa.status = 'completed'
      and qa.mode <> 'quick'
      and qa.completed_at is not null
      and qa.section_b_score >= 60

    union all

    select
      qa.id as attempt_id,
      qa.user_id,
      'C'::text as section,
      egr.total_score::numeric as percentage,
      coalesce(egr.graded_at, qa.completed_at) as achieved_at
    from public.quiz_attempts qa
    join public.essay_grading_results egr on egr.attempt_id = qa.id and egr.user_id = qa.user_id
    join public.essay_responses er on er.attempt_id = qa.id and er.question_id = egr.question_id
    where qa.status = 'completed'
      and qa.section = 'C'
      and qa.completed_at is not null
      and er.submitted_at is not null
      and egr.total_score >= 60
      and egr.answer_hash = md5(regexp_replace(btrim(coalesce(er.response_text, '')), '\s+', ' ', 'g'))
  ),
  best_per_user as (
    select distinct on (raw_scores.section, raw_scores.user_id)
      raw_scores.section,
      raw_scores.user_id,
      raw_scores.percentage,
      raw_scores.achieved_at
    from raw_scores
    order by raw_scores.section, raw_scores.user_id, raw_scores.percentage desc, raw_scores.achieved_at asc, raw_scores.attempt_id
  ),
  eligible_scores as (
    select
      best_per_user.section,
      best_per_user.user_id,
      best_per_user.percentage,
      best_per_user.achieved_at,
      coalesce(nullif(btrim(p.display_name), ''), 'Murid PKSK') as display_name
    from best_per_user
    join public.profiles p on p.id = best_per_user.user_id
    where coalesce(p.role, 'user') = 'user'
      and coalesce(p.is_blocked, false) = false
      and public.is_premium_user(p.id)
  ),
  ranked as (
    select
      eligible_scores.section,
      row_number() over (
        partition by eligible_scores.section
        order by eligible_scores.percentage desc, eligible_scores.achieved_at asc, eligible_scores.user_id
      )::integer as row_rank,
      eligible_scores.display_name,
      round(eligible_scores.percentage, 2) as percentage,
      eligible_scores.achieved_at,
      eligible_scores.user_id = v_user_id as is_current_user
    from eligible_scores
  )
  select
    ranked.section,
    ranked.row_rank as rank,
    ranked.display_name,
    ranked.percentage,
    ranked.achieved_at,
    ranked.is_current_user
  from ranked
  where ranked.row_rank <= 5
  order by ranked.section, ranked.row_rank;
end;
$$;

revoke all on function public.get_my_performance_breakdown() from public, anon, authenticated;
revoke all on function public.get_section_leaderboard() from public, anon, authenticated;
grant execute on function public.get_my_performance_breakdown() to authenticated;
grant execute on function public.get_section_leaderboard() to authenticated;
