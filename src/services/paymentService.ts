import { requireSupabase } from "../lib/supabase";
import type { AdminPaymentRequestRow, CreatePaymentRequestResult, ManualPaymentConfig, PaymentRequest, PaymentRequestStatus, ToyyibPayBillResult } from "../types/payment";

type PaymentProvider = {
  createRequest: (email: string | null) => Promise<CreatePaymentRequestResult>;
  buildConfirmationUrl: (config: ManualPaymentConfig) => string;
};

export const ManualPaymentService: PaymentProvider = {
  async createRequest(email) {
    const client = requireSupabase();
    const { data, error } = await client.rpc("create_manual_payment_request", {
      p_email: email?.trim() || null,
    });

    if (error) {
      throw new Error(mapPaymentMessage(error.message));
    }

    return normalizePaymentCreateResult(data as Partial<CreatePaymentRequestResult>);
  },

  buildConfirmationUrl(config) {
    const phoneNumber = normalizeWhatsAppNumber(config.payment_whatsapp_number);
    const message = [
      "Assalamualaikum CikguSTEM.",
      "",
      "Saya sudah membuat pembayaran Premium PKSK Academy.",
      "",
      "Email langganan saya ialah:",
      "",
      "",
      "Mohon aktifkan akaun Premium saya.",
      "",
      "Terima kasih.",
    ].join("\n");

    return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
  },
};

export const ToyyibPayService = {
  async createBill(): Promise<ToyyibPayBillResult> {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke("create-toyyibpay-bill", {
      body: {},
    });

    if (error) {
      throw new Error(mapPaymentMessage(error.message));
    }

    const payload = data as Partial<ToyyibPayBillResult> | null;
    if (!payload?.paymentUrl) {
      throw new Error("Pautan ToyyibPay belum dapat disediakan. Sila cuba semula.");
    }

    return {
      paymentId: String(payload.paymentId ?? ""),
      billCode: String(payload.billCode ?? ""),
      paymentUrl: String(payload.paymentUrl),
      callbackUrl: String(payload.callbackUrl ?? ""),
    };
  },
};

export async function fetchMyPendingPaymentRequest(): Promise<PaymentRequest | null> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_my_pending_payment_request");

  if (error) {
    throw new Error(mapPaymentMessage(error.message));
  }

  return data ? normalizePaymentRequest(data as Partial<PaymentRequest>) : null;
}

export async function fetchMyLatestPaymentRequest(): Promise<PaymentRequest | null> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_my_latest_payment_request");

  if (error) {
    throw new Error(mapPaymentMessage(error.message));
  }

  return data ? normalizePaymentRequest(data as Partial<PaymentRequest>) : null;
}

export async function fetchAdminPaymentRequests(searchText: string, statusFilter: string): Promise<AdminPaymentRequestRow[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_list_payment_requests", {
    search_text: searchText || null,
    status_filter: statusFilter || "pending",
    page_number: 1,
    page_size: 50,
  });

  if (error) {
    throw new Error(mapPaymentMessage(error.message));
  }

  return ((data ?? []) as Partial<AdminPaymentRequestRow>[]).map(normalizeAdminPaymentRequest);
}

export async function approvePaymentRequest(requestId: string, notes?: string): Promise<void> {
  await updatePaymentRequestStatus(requestId, "approved", notes);
}

export async function rejectPaymentRequest(requestId: string, notes?: string): Promise<void> {
  await updatePaymentRequestStatus(requestId, "rejected", notes);
}

async function updatePaymentRequestStatus(requestId: string, status: Exclude<PaymentRequestStatus, "pending">, notes?: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_update_payment_request", {
    p_request_id: requestId,
    p_status: status,
    p_notes: notes || null,
  });

  if (error) {
    throw new Error(mapPaymentMessage(error.message));
  }
}

function normalizePaymentCreateResult(payload: Partial<CreatePaymentRequestResult>): CreatePaymentRequestResult {
  return {
    id: String(payload.id ?? ""),
    user_id: payload.user_id ? String(payload.user_id) : null,
    email: payload.email ? String(payload.email) : null,
    amount: Number(payload.amount ?? 49),
    currency: String(payload.currency ?? "MYR"),
    status: normalizePaymentStatus(payload.status),
    provider: String(payload.provider ?? "manual_qr"),
    payment_method: String(payload.payment_method ?? payload.provider ?? "manual_qr"),
  };
}

function normalizePaymentRequest(payload: Partial<PaymentRequest>): PaymentRequest {
  return {
    id: String(payload.id ?? ""),
    user_id: payload.user_id ? String(payload.user_id) : null,
    email: payload.email ? String(payload.email) : null,
    amount: Number(payload.amount ?? 49),
    currency: String(payload.currency ?? "MYR"),
    status: normalizePaymentStatus(payload.status),
    provider: String(payload.provider ?? "manual_qr"),
    payment_method: String(payload.payment_method ?? payload.provider ?? "manual_qr"),
    provider_bill_code: payload.provider_bill_code ? String(payload.provider_bill_code) : null,
    provider_reference: payload.provider_reference ? String(payload.provider_reference) : null,
    external_reference: payload.external_reference ? String(payload.external_reference) : null,
    paid_at: payload.paid_at ? String(payload.paid_at) : null,
    notes: payload.notes ? String(payload.notes) : null,
    created_at: String(payload.created_at ?? new Date().toISOString()),
    updated_at: String(payload.updated_at ?? payload.created_at ?? new Date().toISOString()),
  };
}

function normalizeAdminPaymentRequest(payload: Partial<AdminPaymentRequestRow>): AdminPaymentRequestRow {
  return {
    ...normalizePaymentRequest(payload),
    display_name: payload.display_name ? String(payload.display_name) : null,
    reviewed_at: payload.reviewed_at ? String(payload.reviewed_at) : null,
    reviewed_by_name: payload.reviewed_by_name ? String(payload.reviewed_by_name) : null,
    total_count: Number(payload.total_count ?? 0),
  };
}

function normalizePaymentStatus(status: unknown): PaymentRequestStatus {
  return status === "approved" || status === "rejected" || status === "expired" || status === "paid" || status === "failed" || status === "cancelled" ? status : "pending";
}

function normalizeWhatsAppNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.startsWith("60")) {
    return digits;
  }
  if (digits.startsWith("0")) {
    return `6${digits}`;
  }
  return digits;
}

function mapPaymentMessage(message: string): string {
  if (message.includes("ADMIN_REQUIRED")) {
    return "Akses admin diperlukan.";
  }
  if (message.includes("PAYMENT_REQUEST_NOT_FOUND")) {
    return "Rekod bayaran tidak ditemui.";
  }
  if (message.includes("INVALID_PAYMENT_STATUS")) {
    return "Status bayaran tidak sah.";
  }
  if (message.includes("TOYYIBPAY_BILL_FAILED")) {
    return "Bil ToyyibPay belum dapat disediakan. Sila cuba semula atau gunakan QR DuitNow.";
  }
  if (message.includes("PREMIUM_ALREADY_ACTIVE")) {
    return "Akaun Premium sudah aktif.";
  }
  if (message.includes("LOGIN_REQUIRED")) {
    return "Sila log masuk dahulu untuk meneruskan bayaran.";
  }
  if (message.includes("ACCOUNT_BLOCKED")) {
    return "Akaun ini sedang disemak oleh pentadbir.";
  }
  if (message.includes("USER_NOT_FOUND")) {
    return "Akaun pengguna untuk e-mel ini belum ditemui. Minta pengguna daftar akaun dahulu.";
  }

  return message;
}
