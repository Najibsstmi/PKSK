from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pdfplumber


@dataclass
class ParsedQuestion:
  number: int
  section: str
  category: str
  topic: str
  difficulty: str
  question_type: str
  question_text: str
  options: list[dict[str, object]]


REPLACEMENTS = {
  "\ufffd": "-",
  "â€“": "-",
  "â€”": "-",
  "â€¢": "",
  "â€¦": "...",
  "â€œ": '"',
  "â€": '"',
  "â€˜": "'",
  "â€™": "'",
  "Ã—": "x",
  "Ã·": "÷",
  "Â±": "+/-",
  "Â°": "°",
  "Â¼": "1/4",
  "Â½": "1/2",
  "Â¾": "3/4",
}


def normalize_text(value: str) -> str:
  text = value
  for source, replacement in REPLACEMENTS.items():
    text = text.replace(source, replacement)
  text = text.replace("  ", " ")
  return text.strip()


def extract_pdf_text(pdf_path: Path) -> str:
  with pdfplumber.open(pdf_path) as pdf:
    pages = [page.extract_text() or "" for page in pdf.pages]
  return "\n".join(pages)


def clean_lines(text: str) -> list[str]:
  lines: list[str] = []
  for raw_line in text.splitlines():
    line = normalize_text(raw_line)
    if not line:
      continue
    if re.match(r"^-+\s*PAGE\s+\d+\s*-+$", line, re.IGNORECASE):
      continue
    lines.append(line)
  return lines


def parse_answer_key(lines: list[str], marker: str) -> dict[int, str]:
  answers: dict[int, str] = {}
  try:
    start = next(index for index, line in enumerate(lines) if marker in line)
  except StopIteration:
    return answers

  for line in lines[start + 1 :]:
    if line.startswith("Jawapan (") and marker not in line:
      break
    if line.startswith("Bahagian C"):
      break
    for number, option in re.findall(r"(\d+)\s*-\s*([A-D])", line):
      answers[int(number)] = option
  return answers


def slice_between(lines: list[str], start_contains: str, end_contains: str) -> list[str]:
  start = next(index for index, line in enumerate(lines) if start_contains in line)
  end = next(index for index, line in enumerate(lines[start + 1 :], start + 1) if end_contains in line)
  return lines[start:end]


def slice_from_question(lines: list[str], first_question_pattern: str, end_contains: str) -> list[str]:
  start = next(index for index, line in enumerate(lines) if re.match(first_question_pattern, line))
  end = next(index for index, line in enumerate(lines[start + 1 :], start + 1) if end_contains in line)
  return lines[start:end]


def category_for(section: str, number: int, question_text: str) -> tuple[str, str]:
  lowered = question_text.lower()
  if section == "A":
    if any(word in lowered for word in ["rakan", "kawan", "kumpulan", "kelas"]):
      return "SSQ", "Kemahiran Sosial"
    if any(word in lowered for word in ["guru", "ibu bapa", "tanggungjawab", "pengawas"]):
      return "SQ", "Nilai dan Tanggungjawab"
    return "EQ", "Emosi dan Sahsiah"

  if 46 <= number <= 55 or any(word in lowered for word in ["choose", "opposite", "sentence", "plural", "synonym"]):
    return "English", "Bahasa Inggeris"
  if 11 <= number <= 25 or re.search(r"\d|pecahan|peratus|luas|sudut|purata|km|jam", lowered):
    return "Matematik", "Matematik Logik"
  if any(word in lowered for word in ["planet", "vitamin", "air", "haiwan", "tumbuhan", "suhu", "lapisan", "ikan", "organ"]):
    return "Sains", "Sains dan Alam Sekitar"
  if any(word in lowered for word in ["peribahasa", "bahasa", "maksud"]):
    return "Bahasa Melayu", "Bahasa dan Peribahasa"
  if number <= 10:
    return "Logik", "Penaakulan"
  return "Pengetahuan Am", "Pengetahuan Am"


def parse_objective_questions(section: str, question_lines: list[str], answers: dict[int, str]) -> list[ParsedQuestion]:
  questions: list[ParsedQuestion] = []
  current_number: int | None = None
  question_parts: list[str] = []
  options: list[tuple[str, list[str]]] = []
  current_option_label: str | None = None
  current_option_parts: list[str] = []

  def flush_option() -> None:
    nonlocal current_option_label, current_option_parts
    if current_option_label is not None:
      options.append((current_option_label, current_option_parts))
    current_option_label = None
    current_option_parts = []

  def flush_question() -> None:
    nonlocal current_number, question_parts, options
    flush_option()
    if current_number is None or not question_parts:
      return

    correct_label = answers.get(current_number)
    parsed_options: list[dict[str, object]] = []
    for index, (label, parts) in enumerate(options, start=1):
      parsed_options.append(
        {
          "label": label,
          "text": normalize_text(" ".join(parts)),
          "is_correct": label == correct_label,
          "sort_order": index,
        }
      )

    category, topic = category_for(section, current_number, " ".join(question_parts))
    questions.append(
      ParsedQuestion(
        number=current_number,
        section=section,
        category=category,
        topic=topic,
        difficulty="medium",
        question_type="objective",
        question_text=normalize_text(" ".join(question_parts)),
        options=parsed_options,
      )
    )

    current_number = None
    question_parts = []
    options = []

  for line in question_lines:
    if line.startswith("Bahagian ") or line.startswith("IQ, ") or line.startswith("Menguji ") or line.startswith("Pilih ") or line.startswith("Masa:"):
      continue
    if "soalan objektif" in line:
      continue

    question_match = re.match(r"^(\d+)\.(.+)$", line)
    option_match = re.match(r"^([A-D])\.\s*(.+)$", line)

    if question_match:
      flush_question()
      current_number = int(question_match.group(1))
      question_parts = [question_match.group(2)]
      continue

    if option_match and current_number is not None:
      flush_option()
      current_option_label = option_match.group(1)
      current_option_parts = [option_match.group(2)]
      continue

    if current_option_label is not None:
      current_option_parts.append(line)
    elif current_number is not None:
      question_parts.append(line)

  flush_question()
  return questions


def parse_essay_questions(lines: list[str]) -> list[ParsedQuestion]:
  try:
    start = next(index for index, line in enumerate(lines) if line.startswith("Bahagian C:"))
  except StopIteration:
    return []

  essay_lines = lines[start + 1 :]
  questions: list[ParsedQuestion] = []
  current_number: int | None = None
  current_title = ""
  current_parts: list[str] = []

  def flush() -> None:
    nonlocal current_number, current_title, current_parts
    if current_number is None or not current_title:
      return
    prompt = normalize_text(" ".join(current_parts))
    questions.append(
      ParsedQuestion(
        number=current_number,
        section="C",
        category="Karangan",
        topic=current_title,
        difficulty="medium",
        question_type="essay",
        question_text=f"{current_title}: {prompt}" if prompt else current_title,
        options=[],
      )
    )
    current_number = None
    current_title = ""
    current_parts = []

  for line in essay_lines:
    match = re.match(r"^(\d+)\.(.+)$", line)
    if match:
      flush()
      current_number = int(match.group(1))
      current_title = normalize_text(match.group(2))
      continue
    if current_number is not None:
      current_parts.append(line)

  flush()
  return questions


def as_seed_items(questions: Iterable[ParsedQuestion], source_code: str) -> list[dict[str, object]]:
  items: list[dict[str, object]] = []
  for question in questions:
    items.append(
      {
        "source_key": f"{source_code}-{question.section}-{question.number:03d}",
        "question_type": question.question_type,
        "section": question.section,
        "category": question.category,
        "topic": question.topic,
        "difficulty": question.difficulty,
        "question_text": question.question_text,
        "explanation": None,
        "options": question.options,
      }
    )
  return items


def sql_literal(value: str) -> str:
  return value.replace("'", "''")


def build_seed_sql(items: list[dict[str, object]], source_code: str, source_title: str, source_note: str) -> str:
  json_payload = json.dumps(items, ensure_ascii=False, indent=2)
  return f"""-- Simulator PKSK seed data from PDF.
-- Copy and paste this file into Supabase SQL Editor after running supabase/schema.sql.
-- Questions: {len(items)}

do $$
declare
  v_source_id uuid;
  v_question_id uuid;
  v_question jsonb;
  v_option jsonb;
begin
  insert into public.question_sources (code, title, source_type, source_note)
  values ('{sql_literal(source_code)}', '{sql_literal(source_title)}', 'pdf', '{sql_literal(source_note)}')
  on conflict (code) do update set
    title = excluded.title,
    source_type = excluded.source_type,
    source_note = excluded.source_note,
    imported_at = now()
  returning id into v_source_id;

  for v_question in
    select value from jsonb_array_elements($questions$
{json_payload}
$questions$::jsonb)
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
      explanation,
      is_active
    )
    values (
      v_source_id,
      v_question->>'source_key',
      v_question->>'question_type',
      v_question->>'section',
      v_question->>'category',
      v_question->>'topic',
      v_question->>'difficulty',
      v_question->>'question_text',
      nullif(v_question->>'explanation', 'null'),
      true
    )
    on conflict (source_key) do update set
      source_id = excluded.source_id,
      question_type = excluded.question_type,
      section = excluded.section,
      category = excluded.category,
      topic = excluded.topic,
      difficulty = excluded.difficulty,
      question_text = excluded.question_text,
      explanation = excluded.explanation,
      is_active = true,
      updated_at = now()
    returning id into v_question_id;

    delete from public.question_options where question_id = v_question_id;

    for v_option in
      select value from jsonb_array_elements(coalesce(v_question->'options', '[]'::jsonb))
    loop
      insert into public.question_options (
        question_id,
        option_label,
        option_text,
        is_correct,
        sort_order
      )
      values (
        v_question_id,
        v_option->>'label',
        v_option->>'text',
        coalesce((v_option->>'is_correct')::boolean, false),
        coalesce((v_option->>'sort_order')::integer, 0)
      );
    end loop;
  end loop;
end $$;
"""


def main() -> None:
  parser = argparse.ArgumentParser(description="Extract PKSK PDF questions into Supabase seed SQL.")
  parser.add_argument("pdf", type=Path, help="Path to the source PDF.")
  parser.add_argument("--out", type=Path, default=Path("supabase/seed.sql"), help="Output SQL path.")
  parser.add_argument("--source-code", default="tips-pksk-2026", help="Stable source code for source_key prefixes.")
  parser.add_argument("--source-title", default="tips pksk 2026.pdf", help="Human-readable source title.")
  args = parser.parse_args()

  text = extract_pdf_text(args.pdf)
  lines = clean_lines(text)

  section_a_lines = slice_from_question(lines, r"^1\.Kamu melihat", "Bahagian B")
  section_b_lines = slice_from_question(lines, r"^1\.Susunan nombor", "Jawapan (Bahagian A)")
  answers_a = parse_answer_key(lines, "Jawapan (Bahagian A)")
  answers_b = parse_answer_key(lines, "Jawapan (Bahagian B)")

  questions = [
    *parse_objective_questions("A", section_a_lines, answers_a),
    *parse_objective_questions("B", section_b_lines, answers_b),
    *parse_essay_questions(lines),
  ]
  items = as_seed_items(questions, args.source_code)

  objective_items = [item for item in items if item["question_type"] == "objective"]
  option_count = sum(len(item["options"]) for item in objective_items if isinstance(item["options"], list))
  correct_count = sum(
    1
    for item in objective_items
    if isinstance(item["options"], list)
    for option in item["options"]
    if isinstance(option, dict) and option.get("is_correct") is True
  )

  args.out.parent.mkdir(parents=True, exist_ok=True)
  sql = build_seed_sql(
    items,
    args.source_code,
    args.source_title,
    f"Generated from {args.pdf.name}; source PDF is used as the first question bank only.",
  )
  args.out.write_text(sql, encoding="utf-8")

  print(f"wrote {args.out}")
  print(f"questions={len(items)} objective={len(objective_items)} options={option_count} correct={correct_count}")
  print(f"section_a={sum(1 for item in items if item['section'] == 'A')}")
  print(f"section_b={sum(1 for item in items if item['section'] == 'B')}")
  print(f"section_c={sum(1 for item in items if item['section'] == 'C')}")


if __name__ == "__main__":
  main()
