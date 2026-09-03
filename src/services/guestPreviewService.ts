import { requireSupabase } from "../lib/supabase";
import type { GuestAnswerInput, GuestPreviewPayload, GuestPreviewResult } from "../types/access";

export async function fetchGuestPreview(section: "A" | "B", limit: number): Promise<GuestPreviewPayload> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_guest_preview_questions", {
    p_section: section,
    p_limit: limit,
  });

  if (error) {
    throw new Error(mapGuestMessage(error.message));
  }

  return data as GuestPreviewPayload;
}

export async function scoreGuestPreview(answers: GuestAnswerInput[]): Promise<GuestPreviewResult> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("score_guest_preview", {
    p_answers: answers,
  });

  if (error) {
    throw new Error(mapGuestMessage(error.message));
  }

  return data as GuestPreviewResult;
}

function mapGuestMessage(message: string): string {
  if (message.includes("INVALID_SECTION")) {
    return "Bahagian latihan tidak dapat dibuka.";
  }
  if (message.includes("ANSWER_REQUIRED")) {
    return "Pilih jawapan atau skip dahulu sebelum semak jawapan.";
  }
  if (message.includes("INVALID_ANSWER")) {
    return "Jawapan tidak dapat disemak. Sila pilih semula jawapan.";
  }
  if (message.includes("QUESTION_NOT_AVAILABLE")) {
    return "Jawapan untuk soalan preview ini belum tersedia.";
  }
  if (message.includes("CORRECT_OPTION_NOT_FOUND")) {
    return "Jawapan betul belum ditetapkan untuk soalan ini.";
  }

  return "Preview percuma belum tersedia. Sila cuba semula sebentar lagi.";
}
