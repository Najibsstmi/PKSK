-- Expand each academy leaderboard from five to twenty ranked pupils.
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
  where ranked.row_rank <= 20
  order by ranked.section, ranked.row_rank;
end;
$$;

revoke all on function public.get_section_leaderboard() from public, anon, authenticated;
grant execute on function public.get_section_leaderboard() to authenticated;
