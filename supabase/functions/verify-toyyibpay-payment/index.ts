import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, json, requireEnv } from "../_shared/cors.ts";

const PREMIUM_AMOUNT_RM = 49;
const PREMIUM_AMOUNT_CENTS = 4900;

type VerifyPayload = {
  paymentId?: string;
  billCode?: string;
  externalReference?: string;
};

type AuthUser = {
  id: string;
};

type PaymentRecord = {
  id: string;
  user_id: string | null;
  amount: number | string;
  status: string;
  provider: string;
  payment_method: string;
  provider_bill_code: string | null;
  provider_reference: string | null;
  external_reference: string | null;
};

type VerificationStatus = "paid" | "pending" | "failed" | "cancelled";

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return json(request, { error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const secretKey = requireEnv("TOYYIBPAY_SECRET_KEY");
    const baseUrl = normalizeBaseUrl(Deno.env.get("TOYYIBPAY_BASE_URL") ?? "https://toyyibpay.com");
    const authHeader = request.headers.get("Authorization") ?? "";
    const payload = await readRequestPayload(request);
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const requester = authHeader ? await getAuthenticatedUser(supabaseUrl, anonKey, authHeader) : null;
    const payment = await findPayment(serviceClient, payload, requester);

    if (!payment) {
      return json(request, { error: "PAYMENT_REQUEST_NOT_FOUND" }, 404);
    }

    await assertCanVerifyPayment(serviceClient, payment, requester, payload);

    if (payment.payment_method !== "toyyibpay" || payment.provider !== "toyyibpay") {
      return json(request, { error: "INVALID_PAYMENT_METHOD" }, 400);
    }

    if (payment.status === "paid" || payment.status === "approved") {
      return json(request, {
        ok: true,
        idempotent: true,
        status: payment.status,
        paymentId: payment.id,
        premiumActivated: true,
      });
    }

    const billCode = payload.billCode || payment.provider_bill_code;
    if (!billCode) {
      return json(request, { error: "TOYYIBPAY_BILL_CODE_REQUIRED" }, 400);
    }

    const transactionPayload = await fetchToyyibPayTransactions(baseUrl, secretKey, billCode);
    const transaction = firstTransaction(transactionPayload);
    const verificationStatus = getVerificationStatus(transaction);
    const providerReference = getProviderReference(transaction);
    const amountCents = normalizeAmountToCents(readFirst(transaction, ["billpaymentAmount", "billPaymentAmount", "billAmount", "amount", "paidAmount"]));
    const providerResponse = toJsonObject({
      checkedAt: new Date().toISOString(),
      source: "verify-toyyibpay-payment",
      billCode,
      transaction: transactionPayload,
    });

    if (verificationStatus === "paid") {
      if (amountCents !== null && amountCents !== PREMIUM_AMOUNT_CENTS) {
        await serviceClient
          .from("payment_requests")
          .update({
            status: "failed",
            provider_reference: providerReference || payment.provider_reference,
            provider_response: providerResponse,
            notes: `ToyyibPay amount mismatch. Expected RM${PREMIUM_AMOUNT_RM}.`,
          })
          .eq("id", payment.id);

        return json(request, { error: "INVALID_PAYMENT_AMOUNT" }, 400);
      }

      const { data: activation, error: activationError } = await serviceClient.rpc("activate_toyyibpay_premium", {
        p_payment_request_id: payment.id,
        p_provider_reference: providerReference || null,
        p_provider_bill_code: billCode,
        p_provider_response: providerResponse,
      });

      if (activationError) {
        throw new Error(activationError.message);
      }

      return json(request, {
        ok: true,
        status: "paid",
        paymentId: payment.id,
        providerReference,
        premiumActivated: true,
        activation,
      });
    }

    if (verificationStatus === "failed" || verificationStatus === "cancelled") {
      await serviceClient
        .from("payment_requests")
        .update({
          status: verificationStatus,
          provider_reference: providerReference || payment.provider_reference,
          provider_response: providerResponse,
          notes: verificationStatus === "cancelled" ? "ToyyibPay payment cancelled" : "ToyyibPay payment failed",
        })
        .eq("id", payment.id);

      return json(request, {
        ok: true,
        status: verificationStatus,
        paymentId: payment.id,
        providerReference,
        premiumActivated: false,
      });
    }

    await serviceClient
      .from("payment_requests")
      .update({
        status: "pending",
        provider_reference: providerReference || payment.provider_reference,
        provider_response: providerResponse,
        notes: "ToyyibPay payment pending verification",
      })
      .eq("id", payment.id);

    return json(request, {
      ok: true,
      status: "pending",
      paymentId: payment.id,
      providerReference,
      premiumActivated: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ToyyibPay payment could not be verified.";
    return json(request, { error: message }, 500);
  }
});

async function readRequestPayload(request: Request): Promise<VerifyPayload> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    return {
      paymentId: cleanString(body.paymentId ?? body.payment_id ?? body.id),
      billCode: cleanString(body.billCode ?? body.billcode ?? body.BillCode),
      externalReference: cleanString(body.externalReference ?? body.external_reference ?? body.order_id ?? body.orderId),
    };
  } catch {
    return {};
  }
}

async function getAuthenticatedUser(supabaseUrl: string, anonKey: string, authHeader: string): Promise<AuthUser | null> {
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { id: user.id };
}

async function findPayment(serviceClient: ReturnType<typeof createClient>, payload: VerifyPayload, requester: AuthUser | null): Promise<PaymentRecord | null> {
  const columns = "id,user_id,amount,status,provider,payment_method,provider_bill_code,provider_reference,external_reference";

  if (payload.paymentId) {
    const { data, error } = await serviceClient.from("payment_requests").select(columns).eq("id", payload.paymentId).maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data as PaymentRecord | null;
  }

  if (payload.billCode) {
    const { data, error } = await serviceClient
      .from("payment_requests")
      .select(columns)
      .eq("provider_bill_code", payload.billCode)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data as PaymentRecord | null;
  }

  if (payload.externalReference) {
    const { data, error } = await serviceClient
      .from("payment_requests")
      .select(columns)
      .eq("external_reference", payload.externalReference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data as PaymentRecord | null;
  }

  if (requester) {
    const { data, error } = await serviceClient
      .from("payment_requests")
      .select(columns)
      .eq("user_id", requester.id)
      .eq("payment_method", "toyyibpay")
      .in("status", ["pending", "paid", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data as PaymentRecord | null;
  }

  return null;
}

async function assertCanVerifyPayment(serviceClient: ReturnType<typeof createClient>, payment: PaymentRecord, requester: AuthUser | null, payload: VerifyPayload): Promise<void> {
  if (!requester) {
    if (payload.billCode || payload.externalReference) {
      return;
    }
    throw new Error("LOGIN_REQUIRED");
  }

  if (payment.user_id === requester.id) {
    return;
  }

  const { data, error } = await serviceClient.from("profiles").select("role").eq("id", requester.id).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  const role = cleanString((data as { role?: unknown } | null)?.role);
  if (role === "admin" || role === "super_admin") {
    return;
  }

  throw new Error("PAYMENT_ACCESS_DENIED");
}

async function fetchToyyibPayTransactions(baseUrl: string, secretKey: string, billCode: string): Promise<unknown> {
  const endpoint = buildTransactionsEndpoint(baseUrl);
  const body = new URLSearchParams({
    userSecretKey: secretKey,
    billCode,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const responseText = await response.text();
  const payload = parseToyyibPayResponse(responseText);

  if (!response.ok) {
    throw new Error(`TOYYIBPAY_TRANSACTION_LOOKUP_FAILED: ${response.status} ${response.statusText}`);
  }

  return payload;
}

function firstTransaction(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    const match = payload.find((item) => item && typeof item === "object");
    return match ? (match as Record<string, unknown>) : null;
  }

  if (payload && typeof payload === "object") {
    return payload as Record<string, unknown>;
  }

  return null;
}

function getVerificationStatus(transaction: Record<string, unknown> | null): VerificationStatus {
  const rawStatus = readFirst(transaction, [
    "billpaymentStatus",
    "billPaymentStatus",
    "billpaymentStatusId",
    "billPaymentStatusId",
    "paymentStatus",
    "payment_status",
    "status",
    "status_id",
  ]);
  const status = rawStatus.toLowerCase().trim();

  if (["1", "paid", "success", "successful", "settled", "completed", "complete"].includes(status)) {
    return "paid";
  }
  if (["3", "failed", "fail", "unsuccessful", "void", "rejected"].includes(status)) {
    return "failed";
  }
  if (["4", "cancelled", "canceled"].includes(status)) {
    return "cancelled";
  }

  return "pending";
}

function getProviderReference(transaction: Record<string, unknown> | null): string {
  return readFirst(transaction, [
    "billpaymentInvoiceNo",
    "billPaymentInvoiceNo",
    "transaction_id",
    "transactionId",
    "fpx_transaction_id",
    "refno",
    "reference",
  ]);
}

function readFirst(source: Record<string, unknown> | null, keys: string[]): string {
  if (!source) {
    return "";
  }

  const entries = Object.entries(source);
  for (const key of keys) {
    const direct = source[key];
    if (direct != null && String(direct).trim()) {
      return String(direct).trim();
    }

    const match = entries.find(([entryKey]) => entryKey.toLowerCase() === key.toLowerCase());
    if (match?.[1] != null && String(match[1]).trim()) {
      return String(match[1]).trim();
    }
  }

  return "";
}

function normalizeAmountToCents(value: string): number | null {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/,/g, "").trim();
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (cleaned.includes(".")) {
    return Math.round(numeric * 100);
  }

  return numeric >= 1000 ? Math.round(numeric) : Math.round(numeric * 100);
}

function cleanString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function buildTransactionsEndpoint(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);

  if (normalized.endsWith("/index.php/api/getBillTransactions")) {
    return normalized;
  }
  if (normalized.endsWith("/index.php/api")) {
    return `${normalized}/getBillTransactions`;
  }

  return `${normalized}/index.php/api/getBillTransactions`;
}

function parseToyyibPayResponse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function toJsonObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : { raw: payload };
}
