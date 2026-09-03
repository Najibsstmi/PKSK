import { requireSupabase } from "../lib/supabase";
import type { QuizAttemptRow } from "../types/database";
import type { AttemptPayload, CompleteAttemptResult, PkskSectionCode, PrintableSimulationSet, QuizMode, RevealedQuizAnswer } from "../types/quiz";

export type GenerateQuizInput = {
  mode: QuizMode;
  section?: PkskSectionCode | null;
  numberOfQuestions: number;
};

export async function generateQuiz(input: GenerateQuizInput): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("start_quiz", {
    p_mode: input.mode,
    p_section: input.section ?? null,
    p_number_of_questions: input.numberOfQuestions,
  });

  if (error) {
    throw new Error(mapSupabaseMessage(error.message));
  }

  return data;
}

export async function generateFreePreviewQuiz(): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("start_free_preview_quiz");

  if (error) {
    throw new Error(mapSupabaseMessage(error.message));
  }

  return data;
}

export async function getAttemptPayload(attemptId: string): Promise<AttemptPayload> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_attempt_payload", {
    p_attempt_id: attemptId,
  });

  if (error) {
    throw new Error(mapSupabaseMessage(error.message));
  }

  return data as AttemptPayload;
}

export async function generatePrintSimulationSet(): Promise<PrintableSimulationSet> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("generate_print_simulation_set");

  if (error) {
    throw new Error(mapSupabaseMessage(error.message));
  }

  return data as PrintableSimulationSet;
}

export async function submitAnswer(attemptId: string, questionId: string, optionId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("submit_answer", {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_selected_option_id: optionId,
  });

  if (error) {
    throw new Error(mapSupabaseMessage(error.message));
  }
}

export async function revealAnswer(attemptId: string, questionId: string): Promise<RevealedQuizAnswer> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("reveal_attempt_question_answer", {
    p_attempt_id: attemptId,
    p_question_id: questionId,
  });

  if (error) {
    throw new Error(mapSupabaseMessage(error.message));
  }

  return data as RevealedQuizAnswer;
}

export async function skipAnswer(attemptId: string, questionId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("skip_answer", {
    p_attempt_id: attemptId,
    p_question_id: questionId,
  });

  if (error) {
    throw new Error(mapSupabaseMessage(error.message));
  }
}

export async function completeAttempt(attemptId: string): Promise<CompleteAttemptResult> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("complete_attempt", {
    p_attempt_id: attemptId,
  });

  if (error) {
    throw new Error(mapSupabaseMessage(error.message));
  }

  return data as CompleteAttemptResult;
}

export async function fetchActiveAttempt(): Promise<QuizAttemptRow | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("quiz_attempts")
    .select("*")
    .eq("status", "in_progress")
    .or("section.is.null,section.neq.C")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchAttemptHistory(): Promise<QuizAttemptRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("quiz_attempts")
    .select("*")
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export function mapSupabaseMessage(message: string): string {
  if (message.includes("LOGIN_REQUIRED")) {
    return "Sila log masuk dahulu.";
  }
  if (message.includes("PROFILE_NOT_FOUND")) {
    return "Profil akaun belum lengkap. Sila log masuk semula atau kemas kini profil dahulu.";
  }
  if (message.includes("PREMIUM_REQUIRED")) {
    return "Akses premium diperlukan untuk latihan penuh.";
  }
  if (message.includes("MARKETING_CONSENT_REQUIRED")) {
    return "Sila setuju dengan Notis Privasi dan tips/promosi e-mel untuk membuka preview percuma.";
  }
  if (message.includes("ACCOUNT_BLOCKED")) {
    return "Akaun ini belum boleh menggunakan fungsi utama. Sila hubungi pentadbir.";
  }
  if (message.includes("EMPTY_QUESTION_BANK")) {
    return "Bank soalan belum tersedia. Sila maklumkan kepada pentadbir.";
  }
  if (message.includes("NOT_ENOUGH_FREE_PREVIEW_SECTION_A_QUESTIONS")) {
    return "Bank soalan Bahagian A belum cukup 5 soalan aktif untuk preview percuma.";
  }
  if (message.includes("NOT_ENOUGH_FREE_PREVIEW_SECTION_B_QUESTIONS")) {
    return "Bank soalan Bahagian B belum cukup 10 soalan aktif untuk preview percuma.";
  }
  if (message.includes("ATTEMPT_NOT_FINISHED")) {
    return "Jawab atau skip semua soalan dahulu sebelum hantar keputusan.";
  }
  if (message.includes("INVALID_ANSWER")) {
    return "Jawapan tidak dapat disimpan. Cuba semula.";
  }
  if (message.includes("ANSWER_REQUIRED")) {
    return "Pilih jawapan atau skip dahulu sebelum semak jawapan.";
  }
  if (message.includes("ANSWER_ALREADY_REVEALED")) {
    return "Jawapan sudah direveal. Pilihan untuk soalan ini telah dikunci.";
  }
  if (message.includes("ATTEMPT_QUESTION_NOT_FOUND")) {
    return "Soalan ini tidak ditemui dalam cubaan aktif.";
  }
  if (message.includes("CORRECT_OPTION_NOT_FOUND")) {
    return "Jawapan betul belum ditetapkan untuk soalan ini.";
  }
  if (message.includes("NOT_ENOUGH_SECTION_A_QUESTIONS")) {
    return "Bank soalan Bahagian A belum cukup 30 soalan aktif.";
  }
  if (message.includes("NOT_ENOUGH_SECTION_B_QUESTIONS")) {
    return "Bank soalan Bahagian B belum cukup 70 soalan aktif.";
  }
  if (message.includes("NOT_ENOUGH_SECTION_C_QUESTIONS") || message.includes("EMPTY_ESSAY_BANK")) {
    return "Bank soalan Bahagian C belum cukup 1 soalan aktif.";
  }

  return message;
}
