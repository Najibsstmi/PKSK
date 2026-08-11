import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Md5 } from "https://deno.land/std@0.160.0/hash/md5.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, json, requireEnv } from "../_shared/cors.ts";

const PREMIUM_AMOUNT_RM = 49;
const PREMIUM_AMOUNT_CENTS = 4900;

type CallbackPayload = Record<string, string>;

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return json(request, { error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const secretKey = requireEnv("TOYYIBPAY_SECRET_KEY");
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const payload = await readCallbackPayload(request);

    const status = payload.status || payload.status_id || "";
    const refno = payload.refno || payload.transaction_id || payload.fpx_transaction_id || "";
    const billCode = payload.billcode || payload.billCode || payload.BillCode || "";
    const orderId = payload.order_id || payload.orderId || "";
    const receivedHash = (payload.hash || "").toLowerCase();
    const expectedHash = md5(`${secretKey}${status}${orderId}${refno}ok`);

    if (!receivedHash || receivedHash !== expectedHash) {
      return json(request, { error: "INVALID_CALLBACK_HASH" }, 401);
    }

    if (!billCode && !orderId) {
      return json(request, { error: "PAYMENT_REFERENCE_REQUIRED" }, 400);
    }

    const { data: payment, error: paymentError } = await serviceClient
      .from("payment_requests")
      .select("*")
      .or(buildPaymentReferenceFilter(billCode, orderId))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError || !payment) {
      return json(request, { error: "PAYMENT_REQUEST_NOT_FOUND" }, 404);
    }

    const amountCents = normalizeAmountToCents(payload.amount);
    if (amountCents !== null && amountCents !== PREMIUM_AMOUNT_CENTS) {
      await serviceClient
        .from("payment_requests")
        .update({
          status: "failed",
          provider_reference: refno || null,
          provider_response: payload,
          notes: `ToyyibPay amount mismatch. Expected RM${PREMIUM_AMOUNT_RM}.`,
        })
        .eq("id", payment.id);

      return json(request, { error: "INVALID_PAYMENT_AMOUNT" }, 400);
    }

    if (status === "1") {
      if (payment.status === "paid" || payment.status === "approved") {
        return json(request, { ok: true, idempotent: true, status: payment.status });
      }

      const { error: activationError } = await serviceClient.rpc("activate_toyyibpay_premium", {
        p_payment_request_id: payment.id,
        p_provider_reference: refno || null,
        p_provider_bill_code: billCode || null,
        p_provider_response: payload,
      });

      if (activationError) {
        throw new Error(activationError.message);
      }

      return json(request, { ok: true, status: "paid" });
    }

    if (status === "3") {
      await serviceClient
        .from("payment_requests")
        .update({
          status: "failed",
          provider_bill_code: billCode || payment.provider_bill_code,
          provider_reference: refno || payment.provider_reference,
          provider_response: payload,
          notes: payload.reason || "ToyyibPay payment failed",
        })
        .eq("id", payment.id);

      return json(request, { ok: true, status: "failed" });
    }

    await serviceClient
      .from("payment_requests")
      .update({
        status: "pending",
        provider_bill_code: billCode || payment.provider_bill_code,
        provider_reference: refno || payment.provider_reference,
        provider_response: payload,
        notes: payload.reason || "ToyyibPay payment pending",
      })
      .eq("id", payment.id);

    return json(request, { ok: true, status: "pending" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ToyyibPay callback could not be processed.";
    return json(request, { error: message }, 500);
  }
});

async function readCallbackPayload(request: Request): Promise<CallbackPayload> {
  const contentType = request.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value ?? "")]));
  }

  const formData = await request.formData();
  return Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, String(value)]));
}

function buildPaymentReferenceFilter(billCode: string, orderId: string): string {
  const filters: string[] = [];
  if (billCode) {
    filters.push(`provider_bill_code.eq.${billCode}`);
  }
  if (orderId) {
    filters.push(`external_reference.eq.${orderId}`);
  }
  return filters.join(",");
}

function normalizeAmountToCents(value: string | undefined): number | null {
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

function md5(value: string): string {
  return new Md5().update(value).toString().toLowerCase();
}
