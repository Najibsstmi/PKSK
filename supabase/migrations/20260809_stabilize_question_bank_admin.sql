-- Complete the admin Question Bank view/edit workflow.
-- Run this after the PDF question import migration.

create or replace function public.admin_get_question_detail(p_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_payload jsonb;
begin
  select jsonb_build_object(
    'id', q.id,
    'section', q.section,
    'category', q.category,
    'topic', q.topic,
    'difficulty', q.difficulty,
    'question_type', q.question_type,
    'question_text', q.question_text,
    'question_image_url', q.question_image_url,
    'explanation', q.explanation,
    'is_active', q.is_active,
    'archived_at', q.archived_at,
    'source_title', qs.title,
    'created_at', q.created_at,
    'total_count', 1,
    'correct_option_label', (
      select qo.option_label
      from public.question_options qo
      where qo.question_id = q.id
        and qo.is_correct = true
      order by qo.sort_order
      limit 1
    ),
    'essay_min_words', q.essay_min_words,
    'essay_time_limit', q.essay_time_limit,
    'options', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', qo.id,
          'option_label', qo.option_label,
          'option_text', qo.option_text,
          'option_image_url', qo.option_image_url,
          'is_correct', qo.is_correct,
          'sort_order', qo.sort_order
        )
        order by qo.sort_order
      )
      from public.question_options qo
      where qo.question_id = q.id
    ), '[]'::jsonb),
    'assets', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', qa.id,
          'asset_type', qa.asset_type,
          'file_url', qa.file_url,
          'sort_order', qa.sort_order
        )
        order by qa.sort_order, qa.created_at
      )
      from public.question_assets qa
      where qa.question_id = q.id
    ), '[]'::jsonb)
  )
  into v_payload
  from public.questions q
  left join public.question_sources qs on qs.id = q.source_id
  where q.id = p_question_id;

  if v_payload is null then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  perform public.write_admin_audit(v_admin_id, null, 'view_question_detail', jsonb_build_object('question_id', p_question_id));
  return v_payload;
end;
$$;

create or replace function public.admin_update_question(
  question_payload jsonb,
  options_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_question_id uuid;
  v_question_type text := coalesce(nullif(question_payload ->> 'question_type', ''), 'objective');
  v_section text := coalesce(nullif(question_payload ->> 'section', ''), case when v_question_type = 'essay' then 'C' else 'B' end);
  v_difficulty text := coalesce(nullif(question_payload ->> 'difficulty', ''), 'medium');
  v_correct_label text := upper(nullif(question_payload ->> 'correct_option_label', ''));
begin
  if not (question_payload ? 'id') or nullif(question_payload ->> 'id', '') is null then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  v_question_id := (question_payload ->> 'id')::uuid;

  if v_question_type not in ('objective', 'essay') then
    raise exception 'INVALID_QUESTION_TYPE';
  end if;

  if v_section not in ('A', 'B', 'C') then
    raise exception 'INVALID_SECTION';
  end if;

  if v_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'INVALID_DIFFICULTY';
  end if;

  update public.questions q
  set
    question_type = v_question_type,
    section = v_section,
    category = nullif(question_payload ->> 'category', ''),
    topic = nullif(question_payload ->> 'topic', ''),
    difficulty = v_difficulty,
    question_text = coalesce(nullif(question_payload ->> 'question_text', ''), q.question_text),
    question_image_url = nullif(question_payload ->> 'question_image_url', ''),
    explanation = nullif(question_payload ->> 'explanation', ''),
    is_active = coalesce(nullif(question_payload ->> 'is_active', '')::boolean, q.is_active),
    essay_min_words = case
      when v_question_type = 'essay' and nullif(question_payload ->> 'essay_min_words', '') is not null then (question_payload ->> 'essay_min_words')::integer
      when v_question_type = 'essay' then coalesce(q.essay_min_words, 100)
      else null
    end,
    essay_time_limit = case
      when v_question_type = 'essay' and nullif(question_payload ->> 'essay_time_limit', '') is not null then (question_payload ->> 'essay_time_limit')::integer
      when v_question_type = 'essay' then coalesce(q.essay_time_limit, 45)
      else null
    end
  where q.id = v_question_id;

  if not found then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  delete from public.question_options
  where question_id = v_question_id;

  if v_question_type = 'objective' then
    insert into public.question_options (
      question_id,
      option_label,
      option_text,
      option_image_url,
      is_correct,
      sort_order
    )
    select
      v_question_id,
      upper(nullif(option_row.option_label, '')),
      nullif(option_row.option_text, ''),
      nullif(option_row.option_image_url, ''),
      coalesce(option_row.is_correct, upper(nullif(option_row.option_label, '')) = v_correct_label),
      coalesce(option_row.sort_order, (row_number() over ())::integer)
    from jsonb_to_recordset(coalesce(options_payload, question_payload -> 'options', '[]'::jsonb)) as option_row(
      option_label text,
      option_text text,
      option_image_url text,
      is_correct boolean,
      sort_order integer
    )
    where nullif(option_row.option_text, '') is not null
      or nullif(option_row.option_image_url, '') is not null;
  end if;

  perform public.write_admin_audit(v_admin_id, null, 'update_question', jsonb_build_object('question_id', v_question_id));
  return jsonb_build_object('ok', true, 'question_id', v_question_id);
end;
$$;

create or replace function public.admin_update_question_status(
  p_question_id uuid,
  next_is_active boolean,
  archive_question boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
begin
  update public.questions q
  set
    is_active = case when archive_question then false else next_is_active end,
    archived_at = case when archive_question then now() else null end
  where q.id = p_question_id;

  if not found then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  perform public.write_admin_audit(v_admin_id, null, 'update_question_status', jsonb_build_object('question_id', p_question_id, 'is_active', next_is_active, 'archive', archive_question));
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_get_question_detail(uuid) to authenticated;
grant execute on function public.admin_update_question(jsonb, jsonb) to authenticated;
grant execute on function public.admin_update_question_status(uuid, boolean, boolean) to authenticated;
