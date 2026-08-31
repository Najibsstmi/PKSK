import { requireSupabase } from "../lib/supabase";
import type {
  AdminPaymentRequestRow,
  CreatePaymentRequestResult,
  ManualPaymentConfig,
  PaymentRequest,
  PaymentRequestStatus,
  ToyyibPayBillResult,
  ToyyibPayCustomerInput,
  ToyyibPayVerifyResult,
  ToyyibPayVerifyTarget,
} from "../types/payment";

type PaymentProvider = {
  createRequest: (email: string | null) => Promise<CreatePaymentRequestResult>;
  buildConfirmationUrl: (config: ManualPaymentConfig) => string;
};

const referralStorageKey = "pksk-referral-code";

export const ManualPaymentService: PaymentProvider = {
  async createRequest(email) {
    const client = requireSupabase();
    const { data, error } = await client.rpc("create_manual_payment_request", {
      p_email: email?.trim() || null,
      p_referral_code: getStoredReferralCode(),
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
  async createBill(customer?: ToyyibPayCustomerInput): Promise<ToyyibPayBillResult> {
    const client = requireSupabase();
    if (customer) {
      await prepareCheckoutAccount(customer);
    }

    const {
      data: { session },
    } = await client.auth.getSession();
    const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;
    if (!customer && !headers) {
      throw new Error("Sesi log masuk belum bersedia. Sila log masuk semula atau isi maklumat pelanggan.");
    }

    const referralCode = getStoredReferralCode();
    const body = {
      ...(customer ? { customer } : {}),
      ...(referralCode ? { referralCode } : {}),
    };

    const { data, error } = await client.functions.invoke("create-toyyibpay-bill", {
      headers,
      body,
    });

    if (error) {
      throw new Error(mapPaymentMessage(await getFunctionErrorMessage(error)));
    }

    const payload = data as Partial<ToyyibPayBillResult> | null;
    if (!payload?.paymentUrl) {
      throw new Error("Pautan bayaran online belum dapat disediakan. Sila cuba semula.");
    }

    return {
      paymentId: String(payload.paymentId ?? ""),
      billCode: String(payload.billCode ?? ""),
      paymentUrl: String(payload.paymentUrl),
      callbackUrl: String(payload.callbackUrl ?? ""),
    };
  },

  async verifyPayment(target: ToyyibPayVerifyTarget = {}): Promise<ToyyibPayVerifyResult> {
    const client = requireSupabase();
    const {
      data: { session },
    } = await client.auth.getSession();
    const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;

    const { data, error } = await client.functions.invoke("verify-toyyibpay-payment", {
      headers,
      body: target,
    });

    if (error) {
      throw new Error(mapPaymentMessage(await getFunctionErrorMessage(error)));
    }

    const payload = data as Partial<ToyyibPayVerifyResult> | null;
    return {
      ok: Boolean(payload?.ok),
      status: normalizePaymentStatus(payload?.status),
      paymentId: String(payload?.paymentId ?? target.paymentId ?? ""),
      providerReference: payload?.providerReference ? String(payload.providerReference) : null,
      premiumActivated: Boolean(payload?.premiumActivated),
    };
  },
};

export function captureReferralCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const referralCode = normalizeReferralCode(params.get("ref"));
  if (!referralCode) {
    return getStoredReferralCode();
  }

  const existingCode = getStoredReferralCode();
  if (existingCode) {
    return existingCode;
  }

  window.localStorage.setItem(referralStorageKey, referralCode);
  return referralCode;
}

export function getStoredReferralCode(): string | null {
  return normalizeReferralCode(window.localStorage.getItem(referralStorageKey));
}

export async function rememberStoredReferralAttribution(): Promise<void> {
  const referralCode = getStoredReferralCode();
  if (!referralCode) {
    return;
  }

  const client = requireSupabase();
  const { data, error } = await client.rpc("remember_my_referral_attribution", {
    p_referral_code: referralCode,
  });

  if (error) {
    throw new Error(mapPaymentMessage(error.message));
  }

  const payload = data as Partial<{ attributed: boolean; reason: string }> | null;
  if (payload?.attributed === false && payload.reason) {
    window.localStorage.removeItem(referralStorageKey);
  }
}

async function prepareCheckoutAccount(customer: ToyyibPayCustomerInput): Promise<void> {
  const client = requireSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();

  if (session) {
    return;
  }

  const email = customer.email.trim().toLowerCase();
  const displayName = customer.displayName.trim();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: customer.password,
  });

  if (!signInError) {
    return;
  }

  if (isEmailConfirmationMessage(signInError.message) || isRateLimitMessage(signInError.message)) {
    return;
  }
  if (!isInvalidLoginMessage(signInError.message)) {
    throw new Error(signInError.message);
  }

  const { error } = await client.auth.signUp({
    email,
    password: customer.password,
    options: {
      emailRedirectTo: window.location.origin,
      data: {
        display_name: displayName,
        full_name: displayName,
        marketing_consent: customer.marketingConsent === true,
        marketing_consent_source: "checkout",
      },
    },
  });

  if (error && !isExistingAccountMessage(error.message) && !isRateLimitMessage(error.message)) {
    throw new Error(error.message);
  }
}

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

export async function expirePaymentRequest(requestId: string, notes?: string): Promise<void> {
  await updatePaymentRequestStatus(requestId, "expired", notes);
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
    referral_code: payload.referral_code ? String(payload.referral_code) : null,
    referral_agent_id: payload.referral_agent_id ? String(payload.referral_agent_id) : null,
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
    referral_code: payload.referral_code ? String(payload.referral_code) : null,
    referral_agent_id: payload.referral_agent_id ? String(payload.referral_agent_id) : null,
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

function normalizeReferralCode(value: string | null): string | null {
  const code = value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  return code || null;
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
  const toyyibPayDetails = detailAfterCode(message, "TOYYIBPAY_BILL_FAILED");

  if (message.includes("ADMIN_REQUIRED")) {
    return "Akses admin diperlukan.";
  }
  if (message.includes("PAYMENT_REQUEST_NOT_FOUND")) {
    return "Rekod bayaran tidak ditemui.";
  }
  if (message.includes("INVALID_PAYMENT_STATUS")) {
    return "Status bayaran tidak sah.";
  }
  if (message.includes("TOYYIBPAY_TRANSACTION_LOOKUP_FAILED")) {
    return "Status bayaran online belum dapat disemak. Sila cuba refresh sebentar lagi.";
  }
  if (message.includes("TOYYIBPAY_BILL_CODE_REQUIRED")) {
    return "Maklumat bil bayaran online belum ditemui. Sila buka semula halaman Premium dan cuba sekali lagi.";
  }
  if (message.includes("INVALID_PAYMENT_AMOUNT")) {
    return "Jumlah bayaran online tidak sepadan dengan harga Premium.";
  }
  if (message.includes("PAYMENT_ACCESS_DENIED")) {
    return "Anda tidak mempunyai akses untuk menyemak rekod bayaran ini.";
  }
  if (message.includes("INVALID_PAYMENT_METHOD")) {
    return "Rekod ini bukan bayaran online.";
  }
  if (message.includes("TOYYIBPAY_BILL_FAILED")) {
    if (toyyibPayDetails) {
      return `Bayaran online belum dapat disediakan. Maklumat ralat: ${toyyibPayDetails}`;
    }
    return "Bayaran online belum dapat disediakan. Sila cuba semula atau gunakan QR DuitNow.";
  }
  if (message.includes("TOYYIBPAY_SECRET_KEY") || message.includes("TOYYIBPAY_CATEGORY_CODE")) {
    return "Tetapan bayaran online belum lengkap. Sila semak konfigurasi pembayaran dalam Supabase.";
  }
  if (message.includes("PREMIUM_ALREADY_ACTIVE")) {
    return "Akaun Premium sudah aktif.";
  }
  if (message.includes("LOGIN_REQUIRED")) {
    return "Sila isi maklumat pelanggan untuk meneruskan bayaran.";
  }
  if (message.includes("CUSTOMER_INFO_REQUIRED")) {
    return "Sila lengkapkan nama, e-mel dan kata laluan sebelum meneruskan bayaran.";
  }
  if (message.includes("PHONE_REQUIRED")) {
    return "Sila isi nombor telefon yang sah sebelum meneruskan bayaran.";
  }
  if (message.includes("INVALID_EMAIL")) {
    return "Format e-mel tidak sah.";
  }
  if (message.includes("PASSWORD_TOO_SHORT")) {
    return "Kata laluan perlu sekurang-kurangnya 6 aksara.";
  }
  if (message.includes("CHECKOUT_SIGNUP_REQUIRED")) {
    return "Akaun pelanggan belum sempat disediakan. Sila cuba tekan Bayar Secara Online sekali lagi.";
  }
  if (message.includes("ACCOUNT_BLOCKED")) {
    return "Akaun ini sedang disemak oleh pentadbir.";
  }
  if (message.includes("USER_NOT_FOUND")) {
    return "Akaun pengguna untuk e-mel ini belum ditemui. Minta pengguna daftar akaun dahulu.";
  }

  return message;
}

function isExistingAccountMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return lowerMessage.includes("already registered") || lowerMessage.includes("already exists") || lowerMessage.includes("user already");
}

function isInvalidLoginMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return lowerMessage.includes("invalid login credentials") || lowerMessage.includes("invalid credentials");
}

function isEmailConfirmationMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return lowerMessage.includes("email not confirmed") || lowerMessage.includes("confirm your email");
}

function isRateLimitMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return lowerMessage.includes("security purposes") || lowerMessage.includes("rate limit") || lowerMessage.includes("too many requests");
}

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    const payload = await context
      .clone()
      .json()
      .catch(() => null);
    if (payload && typeof payload === "object" && "error" in payload) {
      return formatFunctionErrorPayload(payload as Record<string, unknown>);
    }

    const text = await context
      .clone()
      .text()
      .catch(() => "");
    if (text) {
      return text;
    }
  }

  return error instanceof Error ? error.message : "Bayaran online belum dapat disediakan. Sila cuba semula.";
}

function formatFunctionErrorPayload(payload: Record<string, unknown>): string {
  const code = String(payload.error ?? "");
  const details = summarizeErrorDetails(payload.details);
  return details ? `${code}: ${details}` : code;
}

function detailAfterCode(message: string, code: string): string {
  const marker = `${code}:`;
  const index = message.indexOf(marker);
  if (index === -1) {
    return "";
  }

  return message.slice(index + marker.length).trim();
}

function summarizeErrorDetails(value: unknown): string {
  const summary = summarizeUnknown(value);
  return summary.length > 220 ? `${summary.slice(0, 217)}...` : summary;
}

function summarizeUnknown(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(summarizeUnknown).filter(Boolean).join("; ");
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const preferredKeys = [
      "message",
      "error",
      "reason",
      "status",
      "httpStatus",
      "httpStatusText",
      "response",
      "responseText",
    ];
    const parts = preferredKeys
      .filter((key) => key in object)
      .map((key) => `${key}: ${summarizeUnknown(object[key])}`)
      .filter((part) => !part.endsWith(": "));

    if (parts.length > 0) {
      return parts.join("; ");
    }

    return Object.entries(object)
      .slice(0, 4)
      .map(([key, item]) => `${key}: ${summarizeUnknown(item)}`)
      .filter((part) => !part.endsWith(": "))
      .join("; ");
  }

  return "";
}
