import { requireSupabase } from "../lib/supabase";
import type { QuestionBankCounts } from "../types/access";

export async function fetchQuestionBankCounts(): Promise<QuestionBankCounts> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_public_question_counts");

  if (error) {
    throw new Error(error.message);
  }

  return normalizeQuestionBankCounts(data as Partial<QuestionBankCounts> | null);
}

function normalizeQuestionBankCounts(data: Partial<QuestionBankCounts> | null): QuestionBankCounts {
  const sectionA = Number(data?.section_a ?? 0);
  const sectionB = Number(data?.section_b ?? 0);
  const sectionC = Number(data?.section_c ?? 0);

  return {
    section_a: sectionA,
    section_b: sectionB,
    section_c: sectionC,
    total: Number(data?.total ?? sectionA + sectionB + sectionC),
  };
}
