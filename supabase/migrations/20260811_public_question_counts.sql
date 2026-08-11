create or replace function public.get_public_question_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'section_a', count(*) filter (where section = 'A'),
    'section_b', count(*) filter (where section = 'B'),
    'section_c', count(*) filter (where section = 'C'),
    'total', count(*)
  )
  from public.questions
  where is_active = true
    and archived_at is null;
$$;

grant execute on function public.get_public_question_counts() to anon, authenticated;
