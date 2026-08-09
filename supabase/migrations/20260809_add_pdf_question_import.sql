-- PDF question import workflow for Simulator PKSK.
-- Run after 20260808_add_commercial_access.sql.

create extension if not exists pgcrypto;

alter table public.question_options alter column option_text drop not null;
alter table public.question_options add column if not exists option_image_url text;
alter table public.questions add column if not exists archived_at timestamptz;
alter table public.questions add column if not exists essay_min_words integer;
alter table public.questions add column if not exists essay_time_limit integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'question_options_text_or_image_check'
      and conrelid = 'public.question_options'::regclass
  ) then
    alter table public.question_options
      add constraint question_options_text_or_image_check
      check (
        nullif(btrim(coalesce(option_text, '')), '') is not null
        or nullif(btrim(coalesce(option_image_url, '')), '') is not null
      );
  end if;
end;
$$;

create table if not exists public.question_imports (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  source_title text,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'review', 'completed', 'failed')),
  processing_stage text,
  total_detected integer not null default 0,
  total_imported integer not null default 0,
  processing_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.imported_question_drafts (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.question_imports(id) on delete cascade,
  imported_question_id uuid references public.questions(id) on delete set null,
  source_question_number text,
  question_type text not null default 'objective' check (question_type in ('objective', 'essay')),
  section text check (section in ('A', 'B', 'C')),
  category text,
  topic text,
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  question_text text not null,
  question_image_url text,
  correct_option_label text,
  explanation text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected', 'needs_review')),
  essay_min_words integer,
  essay_time_limit integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.imported_question_draft_options (
  id uuid primary key default gen_random_uuid(),
  draft_question_id uuid not null references public.imported_question_drafts(id) on delete cascade,
  option_label text,
  option_text text,
  option_image_url text,
  is_correct boolean,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (
    nullif(btrim(coalesce(option_text, '')), '') is not null
    or nullif(btrim(coalesce(option_image_url, '')), '') is not null
  )
);

create table if not exists public.question_assets (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.questions(id) on delete cascade,
  draft_question_id uuid references public.imported_question_drafts(id) on delete cascade,
  asset_type text not null default 'question_image' check (asset_type in ('question_image', 'diagram', 'graph', 'table', 'reference_image', 'option_image')),
  file_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (question_id is not null or draft_question_id is not null)
);

create index if not exists idx_question_imports_status_created on public.question_imports (status, created_at desc);
create index if not exists idx_question_imports_uploaded_by on public.question_imports (uploaded_by, created_at desc);
create index if not exists idx_imported_question_drafts_import_status on public.imported_question_drafts (import_id, review_status);
create index if not exists idx_imported_question_draft_options_draft on public.imported_question_draft_options (draft_question_id, sort_order);
create index if not exists idx_question_assets_question on public.question_assets (question_id, sort_order);
create index if not exists idx_question_assets_draft on public.question_assets (draft_question_id, sort_order);
create index if not exists idx_questions_source_active on public.questions (source_id, is_active, archived_at);

drop trigger if exists imported_question_drafts_touch_updated_at on public.imported_question_drafts;
create trigger imported_question_drafts_touch_updated_at
before update on public.imported_question_drafts
for each row execute function public.touch_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('question-imports', 'question-imports', false, 52428800, array['application/pdf']),
  ('question-assets', 'question-assets', true, 52428800, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.admin_create_question_import(
  file_name text,
  storage_path text,
  source_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_import_id uuid;
begin
  insert into public.question_imports (
    uploaded_by,
    file_name,
    storage_path,
    source_title,
    status,
    processing_stage
  )
  values (
    v_admin_id,
    file_name,
    storage_path,
    nullif(btrim(coalesce(source_title, '')), ''),
    'uploaded',
    'uploaded'
  )
  returning id into v_import_id;

  perform public.write_admin_audit(v_admin_id, null, 'create_question_import', jsonb_build_object('import_id', v_import_id, 'file_name', file_name));
  return v_import_id;
end;
$$;

create or replace function public.admin_get_question_import(p_import_id uuid)
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
    'id', qi.id,
    'uploaded_by', qi.uploaded_by,
    'file_name', qi.file_name,
    'storage_path', qi.storage_path,
    'source_title', qi.source_title,
    'status', qi.status,
    'processing_stage', qi.processing_stage,
    'total_detected', qi.total_detected,
    'total_imported', qi.total_imported,
    'processing_error', qi.processing_error,
    'created_at', qi.created_at,
    'completed_at', qi.completed_at,
    'uploaded_by_name', coalesce(p.display_name, p.full_name, 'Admin')
  )
  into v_payload
  from public.question_imports qi
  left join public.profiles p on p.id = qi.uploaded_by
  where qi.id = p_import_id;

  if v_payload is null then
    raise exception 'IMPORT_NOT_FOUND';
  end if;

  return v_payload;
end;
$$;

create or replace function public.admin_list_question_imports(
  status_filter text default 'all',
  page_number integer default 1,
  page_size integer default 30
)
returns table (
  id uuid,
  file_name text,
  source_title text,
  status text,
  processing_stage text,
  total_detected integer,
  total_imported integer,
  processing_error text,
  created_at timestamptz,
  completed_at timestamptz,
  uploaded_by_name text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_page integer := greatest(coalesce(page_number, 1), 1);
  v_size integer := least(greatest(coalesce(page_size, 30), 1), 100);
begin
  return query
  with filtered as (
    select
      qi.id,
      qi.file_name,
      qi.source_title,
      qi.status,
      qi.processing_stage,
      qi.total_detected,
      qi.total_imported,
      qi.processing_error,
      qi.created_at,
      qi.completed_at,
      coalesce(p.display_name, p.full_name, 'Admin') as uploaded_by_name
    from public.question_imports qi
    left join public.profiles p on p.id = qi.uploaded_by
    where coalesce(status_filter, 'all') = 'all'
      or qi.status = status_filter
  )
  select filtered.*, count(*) over() as total_count
  from filtered
  order by filtered.created_at desc
  offset (v_page - 1) * v_size
  limit v_size;
end;
$$;

create or replace function public.admin_list_import_drafts(p_import_id uuid)
returns table (
  id uuid,
  import_id uuid,
  imported_question_id uuid,
  source_question_number text,
  question_type text,
  section text,
  category text,
  topic text,
  difficulty text,
  question_text text,
  question_image_url text,
  correct_option_label text,
  explanation text,
  confidence numeric,
  review_status text,
  essay_min_words integer,
  essay_time_limit integer,
  created_at timestamptz,
  options jsonb,
  assets jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
begin
  if not exists (select 1 from public.question_imports qi where qi.id = p_import_id) then
    raise exception 'IMPORT_NOT_FOUND';
  end if;

  return query
  select
    d.id,
    d.import_id,
    d.imported_question_id,
    d.source_question_number,
    d.question_type,
    d.section,
    d.category,
    d.topic,
    d.difficulty,
    d.question_text,
    d.question_image_url,
    d.correct_option_label,
    d.explanation,
    d.confidence,
    d.review_status,
    d.essay_min_words,
    d.essay_time_limit,
    d.created_at,
    (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'option_label', o.option_label,
          'option_text', o.option_text,
          'option_image_url', o.option_image_url,
          'is_correct', o.is_correct,
          'sort_order', o.sort_order
        )
        order by o.sort_order, o.option_label
      ), '[]'::jsonb)
      from public.imported_question_draft_options o
      where o.draft_question_id = d.id
    ) as options,
    (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'asset_type', a.asset_type,
          'file_url', a.file_url,
          'sort_order', a.sort_order
        )
        order by a.sort_order
      ), '[]'::jsonb)
      from public.question_assets a
      where a.draft_question_id = d.id
    ) as assets
  from public.imported_question_drafts d
  where d.import_id = p_import_id
  order by coalesce(nullif(regexp_replace(d.source_question_number, '\D', '', 'g'), '')::integer, 999999), d.created_at;
end;
$$;

create or replace function public.admin_update_import_draft(
  draft_id uuid,
  draft_payload jsonb,
  options_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_import_id uuid;
  v_review_status text := coalesce(draft_payload ->> 'review_status', 'pending');
begin
  if v_review_status not in ('pending', 'approved', 'rejected', 'needs_review') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;

  update public.imported_question_drafts d
  set
    source_question_number = nullif(btrim(coalesce(draft_payload ->> 'source_question_number', d.source_question_number)), ''),
    question_type = coalesce(nullif(draft_payload ->> 'question_type', ''), d.question_type),
    section = nullif(draft_payload ->> 'section', ''),
    category = nullif(draft_payload ->> 'category', ''),
    topic = nullif(draft_payload ->> 'topic', ''),
    difficulty = nullif(draft_payload ->> 'difficulty', ''),
    question_text = coalesce(nullif(draft_payload ->> 'question_text', ''), d.question_text),
    question_image_url = nullif(draft_payload ->> 'question_image_url', ''),
    correct_option_label = upper(nullif(draft_payload ->> 'correct_option_label', '')),
    explanation = nullif(draft_payload ->> 'explanation', ''),
    confidence = case
      when draft_payload ? 'confidence' and nullif(draft_payload ->> 'confidence', '') is not null then (draft_payload ->> 'confidence')::numeric
      else d.confidence
    end,
    review_status = v_review_status,
    essay_min_words = case
      when draft_payload ? 'essay_min_words' and nullif(draft_payload ->> 'essay_min_words', '') is not null then (draft_payload ->> 'essay_min_words')::integer
      else d.essay_min_words
    end,
    essay_time_limit = case
      when draft_payload ? 'essay_time_limit' and nullif(draft_payload ->> 'essay_time_limit', '') is not null then (draft_payload ->> 'essay_time_limit')::integer
      else d.essay_time_limit
    end
  where d.id = draft_id
  returning d.import_id into v_import_id;

  if v_import_id is null then
    raise exception 'DRAFT_NOT_FOUND';
  end if;

  if options_payload is not null then
    delete from public.imported_question_draft_options where draft_question_id = draft_id;

    insert into public.imported_question_draft_options (
      draft_question_id,
      option_label,
      option_text,
      option_image_url,
      is_correct,
      sort_order
    )
    select
      draft_id,
      upper(nullif(option_row.option_label, '')),
      nullif(option_row.option_text, ''),
      nullif(option_row.option_image_url, ''),
      option_row.is_correct,
      coalesce(option_row.sort_order, (row_number() over ())::integer)
    from jsonb_to_recordset(options_payload) as option_row(
      option_label text,
      option_text text,
      option_image_url text,
      is_correct boolean,
      sort_order integer
    )
    where nullif(option_row.option_text, '') is not null
      or nullif(option_row.option_image_url, '') is not null;
  end if;

  perform public.write_admin_audit(v_admin_id, null, 'update_import_draft', jsonb_build_object('draft_id', draft_id, 'import_id', v_import_id));
  return jsonb_build_object('ok', true, 'draft_id', draft_id);
end;
$$;

create or replace function public.admin_set_import_draft_status(
  draft_ids uuid[],
  next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_count integer;
begin
  if next_status not in ('pending', 'approved', 'rejected', 'needs_review') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;

  update public.imported_question_drafts
  set review_status = next_status
  where id = any(draft_ids)
    and imported_question_id is null;

  get diagnostics v_count = row_count;
  perform public.write_admin_audit(v_admin_id, null, 'batch_update_import_drafts', jsonb_build_object('count', v_count, 'status', next_status));
  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

create or replace function public.admin_import_approved_questions(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_import public.question_imports%rowtype;
  v_source_id uuid;
  v_source_code text;
  v_draft public.imported_question_drafts%rowtype;
  v_question_id uuid;
  v_imported_count integer := 0;
begin
  select * into v_import
  from public.question_imports
  where id = p_import_id;

  if v_import.id is null then
    raise exception 'IMPORT_NOT_FOUND';
  end if;

  v_source_code := 'import-' || replace(v_import.id::text, '-', '');

  insert into public.question_sources (code, title, source_type, source_note)
  values (
    v_source_code,
    coalesce(nullif(v_import.source_title, ''), v_import.file_name),
    'pdf',
    'Imported by admin from ' || v_import.file_name
  )
  on conflict (code) do update set
    title = excluded.title,
    source_note = excluded.source_note
  returning id into v_source_id;

  for v_draft in
    select *
    from public.imported_question_drafts d
    where d.import_id = v_import.id
      and d.review_status = 'approved'
      and d.imported_question_id is null
  loop
    insert into public.questions (
      source_id,
      source_key,
      question_type,
      section,
      category,
      topic,
      difficulty,
      question_text,
      question_image_url,
      explanation,
      is_active,
      essay_min_words,
      essay_time_limit
    )
    values (
      v_source_id,
      v_import.id::text || ':' || v_draft.id::text,
      v_draft.question_type,
      coalesce(v_draft.section, case when v_draft.question_type = 'essay' then 'C' else 'B' end),
      v_draft.category,
      v_draft.topic,
      coalesce(v_draft.difficulty, 'medium'),
      v_draft.question_text,
      v_draft.question_image_url,
      v_draft.explanation,
      true,
      v_draft.essay_min_words,
      v_draft.essay_time_limit
    )
    on conflict (source_key) do update set
      question_text = excluded.question_text,
      question_image_url = excluded.question_image_url,
      explanation = excluded.explanation,
      section = excluded.section,
      category = excluded.category,
      topic = excluded.topic,
      difficulty = excluded.difficulty,
      essay_min_words = excluded.essay_min_words,
      essay_time_limit = excluded.essay_time_limit
    returning id into v_question_id;

    delete from public.question_options where question_id = v_question_id;

    if v_draft.question_type = 'objective' then
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
        o.option_label,
        o.option_text,
        o.option_image_url,
        coalesce(o.is_correct, upper(coalesce(o.option_label, '')) = upper(coalesce(v_draft.correct_option_label, ''))),
        o.sort_order
      from public.imported_question_draft_options o
      where o.draft_question_id = v_draft.id
      order by o.sort_order;
    end if;

    update public.question_assets
    set question_id = v_question_id
    where draft_question_id = v_draft.id
      and question_id is null;

    update public.imported_question_drafts
    set imported_question_id = v_question_id
    where id = v_draft.id;

    v_imported_count := v_imported_count + 1;
  end loop;

  update public.question_imports qi
  set
    status = case when v_imported_count > 0 then 'completed' else qi.status end,
    completed_at = case when v_imported_count > 0 then now() else qi.completed_at end,
    total_imported = (
      select count(*)::integer
      from public.imported_question_drafts d
      where d.import_id = qi.id
        and d.imported_question_id is not null
    )
  where qi.id = v_import.id;

  perform public.write_admin_audit(v_admin_id, null, 'import_approved_questions', jsonb_build_object('import_id', v_import.id, 'imported_count', v_imported_count));
  return jsonb_build_object('ok', true, 'imported_count', v_imported_count);
end;
$$;

create or replace function public.admin_create_manual_question(question_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_question_id uuid;
  v_question_type text := coalesce(nullif(question_payload ->> 'question_type', ''), 'objective');
begin
  if v_question_type not in ('objective', 'essay') then
    raise exception 'INVALID_QUESTION_TYPE';
  end if;

  insert into public.questions (
    question_type,
    section,
    category,
    topic,
    difficulty,
    question_text,
    question_image_url,
    explanation,
    is_active,
    essay_min_words,
    essay_time_limit
  )
  values (
    v_question_type,
    coalesce(nullif(question_payload ->> 'section', ''), case when v_question_type = 'essay' then 'C' else 'B' end),
    nullif(question_payload ->> 'category', ''),
    nullif(question_payload ->> 'topic', ''),
    coalesce(nullif(question_payload ->> 'difficulty', ''), 'medium'),
    coalesce(nullif(question_payload ->> 'question_text', ''), 'Soalan baharu'),
    nullif(question_payload ->> 'question_image_url', ''),
    nullif(question_payload ->> 'explanation', ''),
    true,
    case when nullif(question_payload ->> 'essay_min_words', '') is not null then (question_payload ->> 'essay_min_words')::integer else null end,
    case when nullif(question_payload ->> 'essay_time_limit', '') is not null then (question_payload ->> 'essay_time_limit')::integer else null end
  )
  returning id into v_question_id;

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
      coalesce(option_row.is_correct, upper(nullif(option_row.option_label, '')) = upper(coalesce(question_payload ->> 'correct_option_label', ''))),
      coalesce(option_row.sort_order, (row_number() over ())::integer)
    from jsonb_to_recordset(coalesce(question_payload -> 'options', '[]'::jsonb)) as option_row(
      option_label text,
      option_text text,
      option_image_url text,
      is_correct boolean,
      sort_order integer
    )
    where nullif(option_row.option_text, '') is not null
      or nullif(option_row.option_image_url, '') is not null;
  end if;

  perform public.write_admin_audit(v_admin_id, null, 'create_manual_question', jsonb_build_object('question_id', v_question_id));
  return v_question_id;
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
    archived_at = case when archive_question then now() else q.archived_at end
  where q.id = p_question_id;

  if not found then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  perform public.write_admin_audit(v_admin_id, null, 'update_question_status', jsonb_build_object('question_id', p_question_id, 'is_active', next_is_active, 'archive', archive_question));
  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.admin_list_questions(text, integer, integer);

create or replace function public.admin_list_questions(
  search_text text default null,
  section_filter text default 'all',
  status_filter text default 'all',
  source_filter text default null,
  page_number integer default 1,
  page_size integer default 30
)
returns table (
  id uuid,
  section text,
  category text,
  topic text,
  difficulty text,
  question_type text,
  question_text text,
  question_image_url text,
  is_active boolean,
  archived_at timestamptz,
  source_title text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_page integer := greatest(coalesce(page_number, 1), 1);
  v_size integer := least(greatest(coalesce(page_size, 30), 1), 100);
begin
  return query
  with filtered as (
    select
      q.id,
      q.section,
      q.category,
      q.topic,
      q.difficulty,
      q.question_type,
      q.question_text,
      q.question_image_url,
      q.is_active,
      q.archived_at,
      qs.title as source_title,
      q.created_at
    from public.questions q
    left join public.question_sources qs on qs.id = q.source_id
    where (
        coalesce(search_text, '') = ''
        or q.question_text ilike '%' || search_text || '%'
        or q.category ilike '%' || search_text || '%'
        or q.topic ilike '%' || search_text || '%'
        or qs.title ilike '%' || search_text || '%'
      )
      and (coalesce(section_filter, 'all') = 'all' or q.section = section_filter)
      and (
        coalesce(status_filter, 'all') = 'all'
        or (status_filter = 'active' and q.is_active = true and q.archived_at is null)
        or (status_filter = 'inactive' and q.is_active = false and q.archived_at is null)
        or (status_filter = 'archived' and q.archived_at is not null)
      )
      and (coalesce(source_filter, '') = '' or qs.title ilike '%' || source_filter || '%')
  )
  select filtered.*, count(*) over() as total_count
  from filtered
  order by filtered.created_at desc
  offset (v_page - 1) * v_size
  limit v_size;
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

alter table public.question_imports enable row level security;
alter table public.imported_question_drafts enable row level security;
alter table public.imported_question_draft_options enable row level security;
alter table public.question_assets enable row level security;

drop policy if exists "question imports admin select" on public.question_imports;
create policy "question imports admin select"
on public.question_imports for select
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists "question imports admin insert" on public.question_imports;
create policy "question imports admin insert"
on public.question_imports for insert
to authenticated
with check (public.is_admin_user(auth.uid()) and uploaded_by = auth.uid());

drop policy if exists "question imports admin update" on public.question_imports;
create policy "question imports admin update"
on public.question_imports for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "imported drafts admin all" on public.imported_question_drafts;
create policy "imported drafts admin all"
on public.imported_question_drafts for all
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "imported draft options admin all" on public.imported_question_draft_options;
create policy "imported draft options admin all"
on public.imported_question_draft_options for all
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "question assets public select" on public.question_assets;
create policy "question assets public select"
on public.question_assets for select
to anon, authenticated
using (true);

drop policy if exists "question assets admin all" on public.question_assets;
create policy "question assets admin all"
on public.question_assets for all
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "question imports storage admin insert" on storage.objects;
create policy "question imports storage admin insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'question-imports' and public.is_admin_user(auth.uid()));

drop policy if exists "question imports storage admin select" on storage.objects;
create policy "question imports storage admin select"
on storage.objects for select
to authenticated
using (bucket_id = 'question-imports' and public.is_admin_user(auth.uid()));

drop policy if exists "question assets storage public select" on storage.objects;
create policy "question assets storage public select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'question-assets');

drop policy if exists "question assets storage admin write" on storage.objects;
create policy "question assets storage admin write"
on storage.objects for insert
to authenticated
with check (bucket_id = 'question-assets' and public.is_admin_user(auth.uid()));

grant select, insert, update on public.question_imports to authenticated;
grant select, insert, update on public.imported_question_drafts to authenticated;
grant select, insert, update, delete on public.imported_question_draft_options to authenticated;
grant select, insert, update on public.question_assets to anon, authenticated;
grant execute on function public.admin_create_question_import(text, text, text) to authenticated;
grant execute on function public.admin_get_question_import(uuid) to authenticated;
grant execute on function public.admin_list_question_imports(text, integer, integer) to authenticated;
grant execute on function public.admin_list_import_drafts(uuid) to authenticated;
grant execute on function public.admin_update_import_draft(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.admin_set_import_draft_status(uuid[], text) to authenticated;
grant execute on function public.admin_import_approved_questions(uuid) to authenticated;
grant execute on function public.admin_create_manual_question(jsonb) to authenticated;
grant execute on function public.admin_update_question_status(uuid, boolean, boolean) to authenticated;
grant execute on function public.admin_list_questions(text, text, text, text, integer, integer) to authenticated;
