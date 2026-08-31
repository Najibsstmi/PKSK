import { requireSupabase } from "../lib/supabase";
import type { AdminKpis, AdminQuestionDetail, AdminQuestionRow, AdminUserRow, SubscriptionPlan, UserRole } from "../types/access";
import type { Json } from "../types/database";
import type { ManualQuestionInput } from "../types/imports";

export async function fetchAdminKpis(): Promise<AdminKpis> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_get_kpis");

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }

  return data as AdminKpis;
}

export async function fetchAdminUsers(searchText: string, statusFilter: string): Promise<AdminUserRow[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_list_users", {
    search_text: searchText || null,
    status_filter: statusFilter || "all",
    page_number: 1,
    page_size: 50,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }

  return (data ?? []) as AdminUserRow[];
}

export async function fetchAdminQuestions(searchText: string, sectionFilter = "all", statusFilter = "all", sourceFilter = ""): Promise<AdminQuestionRow[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_list_questions", {
    search_text: searchText || null,
    section_filter: sectionFilter || "all",
    status_filter: statusFilter || "all",
    source_filter: sourceFilter || null,
    page_number: 1,
    page_size: 50,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }

  return (data ?? []) as AdminQuestionRow[];
}

export async function fetchAdminQuestionDetail(questionId: string): Promise<AdminQuestionDetail> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_get_question_detail", {
    p_question_id: questionId,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }

  return data as AdminQuestionDetail;
}

export async function createManualQuestion(input: ManualQuestionInput): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_create_manual_question", {
    question_payload: input as unknown as Json,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }

  return data;
}

export type UploadQuestionImageOptions = {
  folderPrefix?: string;
  fileName?: string;
};

export async function uploadQuestionImage(file: File, options: UploadQuestionImageOptions = {}): Promise<string> {
  const client = requireSupabase();
  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const safeExtension = ["png", "jpg", "jpeg", "webp", "svg"].includes(extension) ? extension : "png";
  const folderPrefix = sanitizeQuestionAssetFolder(options.folderPrefix || `manual/${new Date().toISOString().slice(0, 10)}`);
  const safeFileName = options.fileName ? sanitizeQuestionAssetFileName(options.fileName, safeExtension) : `${crypto.randomUUID()}.${safeExtension}`;
  const path = `${folderPrefix}/${safeFileName}`;
  const { error } = await client.storage.from("question-assets").upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type || "image/png",
    upsert: false,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }

  const { data } = client.storage.from("question-assets").getPublicUrl(path);
  return data.publicUrl;
}

function sanitizeQuestionAssetFolder(folderPrefix: string): string {
  const cleaned = folderPrefix
    .split("/")
    .map((segment) => segment.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-"))
    .filter(Boolean)
    .join("/");

  return cleaned || `manual/${new Date().toISOString().slice(0, 10)}`;
}

function sanitizeQuestionAssetFileName(fileName: string, fallbackExtension: string): string {
  const trimmed = fileName.trim();
  const extension = trimmed.split(".").pop()?.toLowerCase();
  const safeExtension = extension && ["png", "jpg", "jpeg", "webp", "svg"].includes(extension) ? extension : fallbackExtension;
  const baseName = trimmed.replace(/\.[^/.]+$/, "") || crypto.randomUUID();
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "") || crypto.randomUUID();
  return `${safeBaseName}.${safeExtension}`;
}

export async function updateQuestion(input: ManualQuestionInput & { id: string; is_active?: boolean }): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_update_question", {
    question_payload: input as unknown as Json,
    options_payload: input.options as unknown as Json,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function updateQuestionStatus(questionId: string, nextIsActive: boolean, archiveQuestion = false): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_update_question_status", {
    p_question_id: questionId,
    next_is_active: nextIsActive,
    archive_question: archiveQuestion,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function grantPremium(targetUserId: string, plan: SubscriptionPlan): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_grant_premium", {
    target_user_id: targetUserId,
    plan,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function verifyUserEmail(targetUserId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_verify_user_email", {
    target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function extendPremium(targetUserId: string, plan: SubscriptionPlan): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_extend_premium", {
    target_user_id: targetUserId,
    plan,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function revokePremium(targetUserId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_revoke_premium", {
    target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function blockUser(targetUserId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_block_user", {
    target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function unblockUser(targetUserId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_unblock_user", {
    target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function setUserRole(targetUserId: string, role: UserRole): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("super_admin_set_role", {
    target_user_id: targetUserId,
    new_role: role,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export function mapAdminMessage(message: string): string {
  if (message.includes("ADMIN_REQUIRED")) {
    return "Akses admin diperlukan.";
  }
  if (message.includes("SUPER_ADMIN_REQUIRED")) {
    return "Akses super admin diperlukan.";
  }
  if (message.includes("USER_NOT_FOUND")) {
    return "Pengguna tidak ditemui.";
  }
  if (message.includes("INVALID_PLAN")) {
    return "Pelan premium tidak sah.";
  }
  if (message.includes("INVALID_ROLE")) {
    return "Role pengguna tidak sah.";
  }
  if (message.includes("QUESTION_NOT_FOUND")) {
    return "Soalan tidak ditemui.";
  }
  if (message.includes("INVALID_QUESTION_TYPE")) {
    return "Jenis soalan tidak sah.";
  }
  if (message.includes("INVALID_SECTION")) {
    return "Bahagian soalan tidak sah.";
  }
  if (message.includes("INVALID_DIFFICULTY")) {
    return "Aras soalan tidak sah.";
  }

  return message;
}
