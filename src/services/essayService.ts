import { requireSupabase } from "../lib/supabase";
import type { EssayAttemptPayload, EssayFilePayload, EssayGradingRequest, EssayGradingResult, EssaySubmitResult, EssayTranscriptionResult } from "../types/essay";

const SUPPORTED_WRITING_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_WRITING_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_WRITING_FILES = 8;

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

export async function transcribeWritingFiles(files: File[]): Promise<EssayTranscriptionResult> {
  validateWritingFiles(files);
  const payloadFiles = await Promise.all(files.map(toEssayFilePayload));

  const response = await fetch("/api/transcribe-writing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: payloadFiles }),
  });

  if (!response.ok) {
    await throwApiError(response, "AI tidak dapat membaca tulisan ini dengan jelas. Cuba ambil gambar semula di tempat yang lebih terang.");
  }

  return (await response.json()) as EssayTranscriptionResult;
}

export async function gradeWritingAnswer(request: EssayGradingRequest): Promise<EssayGradingResult> {
  const response = await fetch("/api/grade-writing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    await throwApiError(response, "AI belum dapat menyemak jawapan ini. Sila cuba semula sebentar lagi.");
  }

  return (await response.json()) as EssayGradingResult;
}

function validateWritingFiles(files: File[]): void {
  if (!files.length) {
    throw new Error("Pilih gambar atau PDF jawapan dahulu.");
  }

  if (files.length > MAX_WRITING_FILES) {
    throw new Error(`Maksimum ${MAX_WRITING_FILES} fail sahaja untuk satu semakan.`);
  }

  for (const file of files) {
    if (!isSupportedWritingFile(file)) {
      throw new Error("Format fail tidak disokong. Gunakan JPG, JPEG, PNG, WEBP atau PDF.");
    }
    if (file.size > MAX_WRITING_FILE_SIZE_BYTES) {
      throw new Error("Fail terlalu besar. Sila gunakan fail bawah 8MB atau ambil gambar dengan saiz lebih kecil.");
    }
  }
}

function isSupportedWritingFile(file: File): boolean {
  return SUPPORTED_WRITING_FILE_TYPES.includes(file.type) || /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
}

async function toEssayFilePayload(file: File): Promise<EssayFilePayload> {
  return {
    name: file.name,
    type: file.type || inferMimeType(file.name),
    size: file.size,
    dataUrl: await fileToDataUrl(file),
  };
}

function inferMimeType(name: string): string {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.png$/i.test(name)) return "image/png";
  return "image/jpeg";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Fail tidak dapat dibaca. Cuba pilih fail lain."));
    reader.readAsDataURL(file);
  });
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    throw new Error(body.message || body.error || fallback);
  } catch (error) {
    if (error instanceof Error && error.message !== "Unexpected end of JSON input") {
      throw error;
    }
    throw new Error(fallback);
  }
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
  if (message.includes("ESSAY_MIN_WORDS_REQUIRED")) {
    return "Karangan mesti sekurang-kurangnya 100 patah perkataan sebelum dihantar.";
  }

  return message;
}
