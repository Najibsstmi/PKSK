import { requireSupabase } from "../lib/supabase";
import type { EssayAttemptPayload, EssaySubmitResult } from "../types/essay";

export async function startEssayAttempt(): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("start_essay_attempt");

  if (error) {
    throw new Error(mapEssayMessage(error.message));
  }

  return data;
}

export async function fetchActiveEssayAttempt(): Promise<string | null> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("fetch_active_essay_attempt");

  if (error) {
    throw new Error(mapEssayMessage(error.message));
  }

  return data ?? null;
}

export async function getEssayAttemptPayload(attemptId: string): Promise<EssayAttemptPayload> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_essay_attempt_payload", {
    p_attempt_id: attemptId,
  });

  if (error) {
    throw new Error(mapEssayMessage(error.message));
  }

  return data as EssayAttemptPayload;
}

export async function autosaveEssayResponse(attemptId: string, responseText: string): Promise<{ word_count: number; autosaved_at: string }> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("autosave_essay_response", {
    p_attempt_id: attemptId,
    p_response_text: responseText,
  });

  if (error) {
    throw new Error(mapEssayMessage(error.message));
  }

  return data as { word_count: number; autosaved_at: string };
}

export async function submitEssayResponse(attemptId: string, responseText: string): Promise<EssaySubmitResult> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("submit_essay_response", {
    p_attempt_id: attemptId,
    p_response_text: responseText,
  });

  if (error) {
    throw new Error(mapEssayMessage(error.message));
  }

  return data as EssaySubmitResult;
}

function mapEssayMessage(message: string): string {
  if (message.includes("LOGIN_REQUIRED")) {
    return "Sila log masuk dahulu.";
  }
  if (message.includes("PREMIUM_REQUIRED")) {
    return "Akses premium diperlukan untuk Bahagian C.";
  }
  if (message.includes("ACCOUNT_BLOCKED")) {
    return "Akaun ini belum boleh menggunakan fungsi utama. Sila hubungi pentadbir.";
  }
  if (message.includes("EMPTY_ESSAY_BANK")) {
    return "Bank tajuk karangan belum tersedia. Sila maklumkan kepada pentadbir.";
  }
  if (message.includes("ESSAY_ATTEMPT_NOT_FOUND")) {
    return "Cubaan karangan tidak ditemui. Sila mula semula Bahagian C.";
  }

  return message;
}
