select
  row_number() over (
    order by
      case q.section when 'A' then 1 when 'B' then 2 when 'C' then 3 else 4 end,
      q.created_at,
      q.source_key
  ) as no,
  q.id as question_id,
  q.source_key,
  q.question_type,
  q.section,
  q.category,
  q.topic,
  q.difficulty,
  q.is_active,
  q.archived_at,
  q.question_text,
  q.question_image_url,
  max(qo.option_text) filter (where qo.option_label = 'A') as option_a,
  max(qo.option_text) filter (where qo.option_label = 'B') as option_b,
  max(qo.option_text) filter (where qo.option_label = 'C') as option_c,
  max(qo.option_text) filter (where qo.option_label = 'D') as option_d,
  max(qo.option_label) filter (where qo.is_correct) as correct_label,
  max(qo.option_text) filter (where qo.is_correct) as correct_answer,
  q.explanation,
  q.created_at,
  q.updated_at,
  '' as catatan_semakan
from public.questions q
left join public.question_options qo on qo.question_id = q.id
group by
  q.id,
  q.source_key,
  q.question_type,
  q.section,
  q.category,
  q.topic,
  q.difficulty,
  q.is_active,
  q.archived_at,
  q.question_text,
  q.question_image_url,
  q.explanation,
  q.created_at,
  q.updated_at
order by
  case q.section when 'A' then 1 when 'B' then 2 when 'C' then 3 else 4 end,
  q.created_at,
  q.source_key;
