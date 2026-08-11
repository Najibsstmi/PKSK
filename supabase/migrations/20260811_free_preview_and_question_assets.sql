insert into public.app_settings (key, value, description)
values
  ('free_preview_section_a_limit', '15'::jsonb, 'Jumlah soalan Bahagian A yang dibuka dalam preview percuma.'),
  ('free_preview_section_b_limit', '20'::jsonb, 'Jumlah soalan Bahagian B yang dibuka dalam preview percuma.'),
  ('free_preview_section_c_enabled', 'false'::jsonb, 'Bahagian C dikunci untuk preview percuma.')
on conflict (key) do update
set
  value = excluded.value,
  description = excluded.description;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('question-assets', 'question-assets', true, 52428800, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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

create or replace function public.get_guest_preview_questions(
  p_section text,
  p_limit integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_max_limit integer;
  v_payload jsonb;
begin
  if p_section not in ('A', 'B') then
    raise exception 'INVALID_SECTION';
  end if;

  v_max_limit := case when p_section = 'A' then 15 else 20 end;

  select coalesce(
    p_limit,
    case
      when p_section = 'A' then (select (value #>> '{}')::integer from public.app_settings where key = 'free_preview_section_a_limit')
      else (select (value #>> '{}')::integer from public.app_settings where key = 'free_preview_section_b_limit')
    end,
    v_max_limit
  ) into v_limit;

  v_limit := least(greatest(v_limit, 1), v_max_limit);

  with selected_questions as (
    select q.*
    from public.questions q
    where q.is_active = true
      and q.question_type = 'objective'
      and q.section = p_section
    order by random()
    limit v_limit
  ),
  ordered_questions as (
    select sq.*, row_number() over (order by random())::integer as question_order
    from selected_questions sq
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oq.id,
      'section', oq.section,
      'category', oq.category,
      'topic', oq.topic,
      'difficulty', oq.difficulty,
      'question_text', oq.question_text,
      'question_image_url', oq.question_image_url,
      'question_order', oq.question_order,
      'selected_option_id', null,
      'options', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', qo.id,
            'option_text', qo.option_text,
            'option_image_url', qo.option_image_url,
            'option_order', row_numbered.option_order
          )
          order by row_numbered.option_order
        ), '[]'::jsonb)
        from (
          select qo2.*, row_number() over (order by random())::integer as option_order
          from public.question_options qo2
          where qo2.question_id = oq.id
        ) row_numbered
        join public.question_options qo on qo.id = row_numbered.id
      )
    )
    order by oq.question_order
  ), '[]'::jsonb)
  into v_payload
  from ordered_questions oq;

  return jsonb_build_object(
    'section', p_section,
    'limit', v_limit,
    'questions', v_payload
  );
end;
$$;

grant execute on function public.get_guest_preview_questions(text, integer) to anon, authenticated;
