import { requireSupabase } from "../lib/supabase";
import type { QuizAttemptRow } from "../types/database";
import type { AttemptPayload, CompleteAttemptResult, PkskSectionCode, QuizMode } from "../types/quiz";

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
  if (message.includes("EMPTY_QUESTION_BANK")) {
    return "Bank soalan masih kosong. Jalankan SQL seed di Supabase dahulu.";
  }
  if (message.includes("ATTEMPT_NOT_FINISHED")) {
    return "Jawab semua soalan dahulu sebelum hantar keputusan.";
  }
  if (message.includes("INVALID_ANSWER")) {
    return "Jawapan tidak dapat disimpan. Cuba semula.";
  }

  return message;
}
