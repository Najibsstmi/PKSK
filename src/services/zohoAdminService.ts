import { requireSupabase } from "../lib/supabase";
import type { ZohoBackfillPreview, ZohoBackfillRunResult, ZohoConnectionResult, ZohoDashboard, ZohoProcessResult, ZohoRetryResult, ZohoSingleUserSyncResult } from "../types/zoho";

type ZohoAction = "test_connection" | "preview_backfill" | "run_backfill" | "process_queue" | "retry_failed" | "sync_single_user";

export async function fetchZohoDashboard(): Promise<ZohoDashboard> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_zoho_get_dashboard");

  if (error) {
    throw new Error(mapZohoMessage(error.message));
  }

  return data as ZohoDashboard;
}

export async function testZohoConnection(): Promise<ZohoConnectionResult> {
  return invokeZohoFunction<ZohoConnectionResult>({ action: "test_connection" });
}

export async function previewZohoBackfill(): Promise<ZohoBackfillPreview> {
  const result = await invokeZohoFunction<{ ok: boolean; preview: ZohoBackfillPreview }>({ action: "preview_backfill" });
  return result.preview;
}

export async function runZohoBackfill(batchSize: number): Promise<ZohoBackfillRunResult> {
  return invokeZohoFunction<ZohoBackfillRunResult>({ action: "run_backfill", batchSize });
}

export async function processZohoQueue(batchSize: number): Promise<ZohoProcessResult> {
  const result = await invokeZohoFunction<{ ok: boolean; processed: ZohoProcessResult }>({ action: "process_queue", batchSize });
  return result.processed;
}

export async function retryFailedZohoSync(batchSize: number): Promise<ZohoRetryResult> {
  return invokeZohoFunction<ZohoRetryResult>({ action: "retry_failed", batchSize });
}

export async function syncSingleZohoUser(email: string): Promise<ZohoSingleUserSyncResult> {
  return invokeZohoFunction<ZohoSingleUserSyncResult>({ action: "sync_single_user", email });
}

async function invokeZohoFunction<T>(body: { action: ZohoAction; batchSize?: number; email?: string; userId?: string }): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("zoho-campaigns-sync", { body });

  if (error) {
    throw new Error(mapZohoMessage(await getFunctionErrorMessage(error)));
  }

  return data as T;
}

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    const payload = await context
      .clone()
      .json()
      .catch(() => null);
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      const code = record.error ? String(record.error) : "";
      const message = record.message ? String(record.message) : "";
      const details = summarizeDetails(record.details);
      return [code, message, details].filter(Boolean).join(": ");
    }

    const text = await context
      .clone()
      .text()
      .catch(() => "");
    if (text) {
      return text;
    }
  }

  return error instanceof Error ? error.message : "Zoho sync belum dapat diproses.";
}

function summarizeDetails(value: unknown): string {
  if (!value || typeof value !== "object") {
    return value ? String(value) : "";
  }

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.missingFields)) {
    return `Missing fields: ${record.missingFields.join(", ")}`;
  }
  if (record.httpStatus) {
    return `HTTP ${record.httpStatus}`;
  }
  return "";
}

function mapZohoMessage(message: string): string {
  if (message.includes("ADMIN_REQUIRED")) {
    return "Akses admin diperlukan untuk Zoho Sync.";
  }
  if (message.includes("LOGIN_REQUIRED")) {
    return "Sila log masuk semula sebagai admin.";
  }
  if (message.includes("ZOHO_TOKEN_REFRESH_FAILED")) {
    return `Zoho OAuth gagal refresh token. ${detailAfterCode(message, "ZOHO_TOKEN_REFRESH_FAILED")}`;
  }
  if (message.includes("ZOHO_CUSTOM_FIELDS_MISSING")) {
    return `Custom field Zoho belum lengkap. ${detailAfterCode(message, "ZOHO_CUSTOM_FIELDS_MISSING")}`;
  }
  if (message.includes("ZOHO_LIST_CHECK_FAILED")) {
    return `Zoho list key tidak dapat disahkan. ${detailAfterCode(message, "ZOHO_LIST_CHECK_FAILED")}`;
  }
  if (message.includes("USER_NOT_FOUND")) {
    return "Pengguna tidak ditemui untuk sync Zoho.";
  }
  return message;
}

function detailAfterCode(message: string, code: string): string {
  const marker = `${code}:`;
  const index = message.indexOf(marker);
  return index >= 0 ? message.slice(index + marker.length).trim() : "";
}
