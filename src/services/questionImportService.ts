import { requireSupabase } from "../lib/supabase";
import type { Json } from "../types/database";
import type { DraftReviewStatus, ImportedQuestionDraft, QuestionImportRow } from "../types/imports";

export async function createPdfQuestionImport(file: File, sourceTitle: string): Promise<string> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError || !userData.user) {
    throw new Error("Sila log masuk sebagai admin dahulu.");
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Sila pilih fail PDF sahaja.");
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase();
  const storagePath = `${userData.user.id}/${Date.now()}/source-${safeFileName}`;
  const { error: uploadError } = await client.storage.from("question-imports").upload(storagePath, file, {
    cacheControl: "3600",
    contentType: "application/pdf",
    upsert: false,
  });

  if (uploadError) {
    throw new Error(mapImportMessage(uploadError.message));
  }

  const { data, error } = await client.rpc("admin_create_question_import", {
    file_name: file.name,
    storage_path: storagePath,
    source_title: sourceTitle || file.name.replace(/\.pdf$/i, ""),
  });

  if (error) {
    throw new Error(mapImportMessage(error.message));
  }

  return data;
}

export async function fetchQuestionImport(importId: string): Promise<QuestionImportRow> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_get_question_import", {
    p_import_id: importId,
  });

  if (error) {
    throw new Error(mapImportMessage(error.message));
  }

  return data as QuestionImportRow;
}

export async function fetchQuestionImports(statusFilter = "all"): Promise<QuestionImportRow[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_list_question_imports", {
    status_filter: statusFilter,
    page_number: 1,
    page_size: 50,
  });

  if (error) {
    throw new Error(mapImportMessage(error.message));
  }

  return (data ?? []) as QuestionImportRow[];
}

export async function fetchImportDrafts(importId: string): Promise<ImportedQuestionDraft[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_list_import_drafts", {
    p_import_id: importId,
  });

  if (error) {
    throw new Error(mapImportMessage(error.message));
  }

  return (data ?? []) as ImportedQuestionDraft[];
}

export type ProcessPdfImportResult = {
  ok: boolean;
  detected: number;
  warning: string | null;
};

export async function processPdfImport(importId: string): Promise<ProcessPdfImportResult> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("process-pdf-import", {
    body: { importId },
  });

  if (error) {
    throw new Error(mapImportMessage(await getFunctionErrorMessage(error)));
  }

  return (data ?? { ok: true, detected: 0, warning: null }) as ProcessPdfImportResult;
}

export async function updateImportDraft(draft: ImportedQuestionDraft): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_update_import_draft", {
    draft_id: draft.id,
    draft_payload: {
      source_question_number: draft.source_question_number,
      question_type: draft.question_type,
      section: draft.section,
      category: draft.category,
      topic: draft.topic,
      difficulty: draft.difficulty,
      question_text: draft.question_text,
      question_image_url: draft.question_image_url,
      correct_option_label: draft.correct_option_label,
      explanation: draft.explanation,
      confidence: draft.confidence,
      review_status: draft.review_status,
      essay_min_words: draft.essay_min_words,
      essay_time_limit: draft.essay_time_limit,
    } as Json,
    options_payload: draft.options as unknown as Json,
  });

  if (error) {
    throw new Error(mapImportMessage(error.message));
  }
}

export async function setImportDraftStatus(draftIds: string[], nextStatus: DraftReviewStatus): Promise<void> {
  if (draftIds.length === 0) {
    return;
  }

  const client = requireSupabase();
  const { error } = await client.rpc("admin_set_import_draft_status", {
    draft_ids: draftIds,
    next_status: nextStatus,
  });

  if (error) {
    throw new Error(mapImportMessage(error.message));
  }
}

export async function importApprovedQuestions(importId: string): Promise<number> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_import_approved_questions", {
    p_import_id: importId,
  });

  if (error) {
    throw new Error(mapImportMessage(error.message));
  }

  return Number((data as { imported_count?: number } | null)?.imported_count ?? 0);
}

export function mapImportMessage(message: string): string {
  if (message.includes("ADMIN_REQUIRED")) {
    return "Akses admin diperlukan.";
  }
  if (message.includes("IMPORT_NOT_FOUND")) {
    return "Rekod import tidak ditemui.";
  }
  if (message.includes("DRAFT_NOT_FOUND")) {
    return "Draft soalan tidak ditemui.";
  }
  if (message.includes("INVALID_REVIEW_STATUS")) {
    return "Status semakan tidak sah.";
  }
  if (message.includes("Bucket not found") || message.includes("question-imports")) {
    return "Storage import PDF belum disediakan. Jalankan migration import PDF dahulu.";
  }
  if (
    message.includes("FunctionsFetchError") ||
    message.includes("Failed to send a request to the Edge Function") ||
    message.includes("Failed to fetch") ||
    message.includes("process-pdf-import")
  ) {
    return "PDF berjaya dimuat naik, tetapi pemproses PDF belum dapat dihubungi. Pastikan Supabase Edge Function process-pdf-import sudah deploy.";
  }
  if (message.includes("SUPABASE_SERVICE_ROLE_KEY") || message.includes("SUPABASE_URL") || message.includes("SUPABASE_ANON_KEY")) {
    return "Pemproses PDF sudah dipanggil, tetapi secret server Supabase belum lengkap. Set SUPABASE_SERVICE_ROLE_KEY untuk Edge Function.";
  }
  if (message.includes("teks tidak dapat dibaca") || message.includes("scan/gambar")) {
    return "PDF berjaya dimuat naik, tetapi teks tidak dapat dibaca. Gunakan PDF yang ada teks sebenar, atau aktifkan OCR/AI selepas beri kebenaran.";
  }
  if (message.includes("Tiada draft soalan") || message.includes("No questions were detected")) {
    return "Tiada soalan berjaya dikesan. Cuba PDF yang lebih jelas atau pecahkan PDF mengikut bahagian.";
  }
  if (message.includes("PDF could not be downloaded")) {
    return "PDF tidak dapat dibaca daripada storage. Cuba upload semula fail PDF tersebut.";
  }

  return message;
}

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  if (typeof error === "object" && error !== null && "context" in error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      try {
        const body = (await response.clone().json()) as { error?: string; message?: string };
        return body.error || body.message || fallbackErrorMessage(error);
      } catch {
        return fallbackErrorMessage(error);
      }
    }
  }

  return fallbackErrorMessage(error);
}

function fallbackErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Pemproses PDF gagal.";
}
