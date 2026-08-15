-- Route CSV question imports through the same draft review workflow as PDF imports.

create or replace function public.admin_create_csv_question_import(
  file_name text,
  source_title text default null,
  questions_payload jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_import_id uuid;
  v_detected integer;
  v_question jsonb;
  v_index integer;
  v_question_type text;
  v_section text;
  v_difficulty text;
  v_question_text text;
  v_correct_label text;
  v_draft_id uuid;
begin
  if jsonb_typeof(questions_payload) <> 'array' then
    raise exception 'INVALID_CSV_PAYLOAD';
  end if;

  v_detected := jsonb_array_length(questions_payload);
  if v_detected = 0 then
    raise exception 'CSV_EMPTY';
  end if;

  insert into public.question_imports (
    uploaded_by,
    file_name,
    storage_path,
    source_title,
    status,
    processing_stage,
    total_detected,
    processing_error
  )
  values (
    v_admin_id,
    coalesce(nullif(btrim(file_name), ''), 'import-soalan.csv'),
    'csv://' || gen_random_uuid()::text,
    nullif(btrim(coalesce(source_title, '')), ''),
    'review',
    'csv_ready_for_review',
    v_detected,
    null
  )
  returning id into v_import_id;

  for v_question, v_index in
    select value, ordinality::integer
    from jsonb_array_elements(questions_payload) with ordinality
  loop
    v_question_type := coalesce(nullif(v_question ->> 'question_type', ''), 'objective');
    if v_question_type not in ('objective', 'essay') then
      raise exception 'INVALID_QUESTION_TYPE_ROW_%', v_index;
    end if;

    v_section := coalesce(nullif(v_question ->> 'section', ''), case when v_question_type = 'essay' then 'C' else 'B' end);
    if v_section not in ('A', 'B', 'C') then
      raise exception 'INVALID_SECTION_ROW_%', v_index;
    end if;

    v_difficulty := coalesce(nullif(v_question ->> 'difficulty', ''), 'medium');
    if v_difficulty not in ('easy', 'medium', 'hard') then
      raise exception 'INVALID_DIFFICULTY_ROW_%', v_index;
    end if;

    v_question_text := nullif(btrim(coalesce(v_question ->> 'question_text', '')), '');
    if v_question_text is null then
      raise exception 'CSV_QUESTION_TEXT_REQUIRED_ROW_%', v_index;
    end if;

    v_correct_label := upper(nullif(btrim(coalesce(v_question ->> 'correct_option_label', '')), ''));

    insert into public.imported_question_drafts (
      import_id,
      source_question_number,
      question_type,
      section,
      category,
      topic,
      difficulty,
      question_text,
      question_image_url,
      correct_option_label,
      explanation,
      confidence,
      review_status,
      essay_min_words,
      essay_time_limit
    )
    values (
      v_import_id,
      coalesce(nullif(v_question ->> 'source_question_number', ''), v_index::text),
      v_question_type,
      v_section,
      nullif(v_question ->> 'category', ''),
      nullif(v_question ->> 'topic', ''),
      v_difficulty,
      v_question_text,
      nullif(v_question ->> 'question_image_url', ''),
      v_correct_label,
      nullif(v_question ->> 'explanation', ''),
      case
        when v_question_type = 'essay' then 0.82
        when v_correct_label is not null then 0.9
        else 0.55
      end,
      case
        when v_question_type = 'objective' and v_correct_label is null then 'needs_review'
        else 'pending'
      end,
      case when nullif(v_question ->> 'essay_min_words', '') is not null then (v_question ->> 'essay_min_words')::integer else null end,
      case when nullif(v_question ->> 'essay_time_limit', '') is not null then (v_question ->> 'essay_time_limit')::integer else null end
    )
    returning id into v_draft_id;

    if v_question_type = 'objective' then
      insert into public.imported_question_draft_options (
        draft_question_id,
        option_label,
        option_text,
        option_image_url,
        is_correct,
        sort_order
      )
      select
        v_draft_id,
        upper(nullif(option_row.option_label, '')),
        nullif(option_row.option_text, ''),
        nullif(option_row.option_image_url, ''),
        coalesce(option_row.is_correct, upper(nullif(option_row.option_label, '')) = v_correct_label),
        coalesce(option_row.sort_order, (row_number() over ())::integer)
      from jsonb_to_recordset(coalesce(v_question -> 'options', '[]'::jsonb)) as option_row(
        option_label text,
        option_text text,
        option_image_url text,
        is_correct boolean,
        sort_order integer
      )
      where nullif(option_row.option_text, '') is not null
        or nullif(option_row.option_image_url, '') is not null;
    end if;
  end loop;

  perform public.write_admin_audit(
    v_admin_id,
    null,
    'create_csv_question_import',
    jsonb_build_object('import_id', v_import_id, 'file_name', file_name, 'detected', v_detected)
  );

  return v_import_id;
end;
$$;

grant execute on function public.admin_create_csv_question_import(text, text, jsonb) to authenticated;
