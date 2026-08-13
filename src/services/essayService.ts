import { requireSupabase } from "../lib/supabase";
import type { EssayAttemptPayload, EssayFilePayload, EssayGradingRequest, EssayGradingResult, EssaySubmitResult, EssayTranscriptionResult } from "../types/essay";

const SUPPORTED_WRITING_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_WRITING_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_WRITING_PDF_SIZE_BYTES = 3 * 1024 * 1024;
const MAX_TRANSCRIPTION_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_WRITING_FILES = 8;
const IMAGE_MAX_WIDTH = 1800;
const IMAGE_MAX_HEIGHT = 2400;
const IMAGE_QUALITY = 0.84;

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
  const body = JSON.stringify({ files: payloadFiles });

  if (new Blob([body]).size > MAX_TRANSCRIPTION_PAYLOAD_BYTES) {
    throw new Error("Fail terlalu besar untuk diproses sekali gus. Cuba hantar satu gambar dahulu, atau ambil semula gambar dengan kawasan kertas sahaja.");
  }

  const response = await fetch("/api/transcribe-writing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    await throwApiError(response, "AI tidak dapat membaca tulisan ini dengan jelas. Cuba ambil gambar semula di tempat yang lebih terang.");
  }

  return readApiJson<EssayTranscriptionResult>(response, "AI tidak dapat membaca tulisan ini dengan jelas. Cuba ambil gambar semula di tempat yang lebih terang.");
}

export async function gradeWritingAnswer(request: EssayGradingRequest): Promise<EssayGradingResult> {
  const response = await fetch("/api/grade-writing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    await throwApiError(response, "Semakan markah AI belum berjaya. Sila cuba semula, atau semak transkripsi dan hantar semula.");
  }

  return readApiJson<EssayGradingResult>(response, "Semakan markah AI belum berjaya. Sila cuba semula, atau semak transkripsi dan hantar semula.");
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
    if ((file.type === "application/pdf" || /\.pdf$/i.test(file.name)) && file.size > MAX_WRITING_PDF_SIZE_BYTES) {
      throw new Error("PDF terlalu besar untuk dihantar. Sila kecilkan PDF atau upload gambar halaman jawapan satu persatu.");
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
  const preparedFile = await prepareWritingFile(file);
  return {
    name: preparedFile.name,
    type: preparedFile.type || inferMimeType(preparedFile.name),
    size: preparedFile.size,
    dataUrl: await fileToDataUrl(preparedFile),
  };
}

async function prepareWritingFile(file: File): Promise<File> {
  if (!isImageFile(file)) {
    return file;
  }

  try {
    const compressed = await compressImageFile(file);
    return compressed.size < file.size ? compressed : file;
  } catch {
    return file;
  }
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);
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

async function compressImageFile(file: File): Promise<File> {
  const image = await loadImage(file);
  const scale = Math.min(1, IMAGE_MAX_WIDTH / image.width, IMAGE_MAX_HEIGHT / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY);
  });

  if (!blob) {
    return file;
  }

  const name = file.name.replace(/\.[^.]+$/, "") || "jawapan";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Imej tidak dapat diproses. Cuba pilih gambar lain."));
    };
    image.src = url;
  });
}

async function readApiJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(friendlyHttpError(response, text, fallback));
  }
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const text = await response.text();
  let body: { message?: string; error?: string } | null = null;

  try {
    body = JSON.parse(text) as { message?: string; error?: string };
  } catch {
    throw new Error(friendlyHttpError(response, text, fallback));
  }

  throw new Error(body.message || body.error || fallback);
}

function friendlyHttpError(response: Response, text: string, fallback: string): string {
  if (response.status === 413 || /request entity|payload too large|body exceeded/i.test(text)) {
    return "Gambar atau PDF terlalu besar untuk dihantar. Cuba ambil semula gambar dengan kawasan kertas sahaja, atau upload satu halaman pada satu masa.";
  }

  if (response.status >= 500) {
    return "Server sedang sibuk memproses semakan AI. Sila cuba semula sebentar lagi.";
  }

  return fallback;
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
