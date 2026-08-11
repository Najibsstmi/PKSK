import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, json, requireEnv } from "../_shared/cors.ts";

const PREMIUM_AMOUNT_RM = 49;
const PREMIUM_AMOUNT_CENTS = 4900;
const RETURN_URL = "https://pksk.cikgustem.com/payment-result";

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
    const categoryCode = requireEnv("TOYYIBPAY_CATEGORY_CODE");
    const baseUrl = normalizeBaseUrl(Deno.env.get("TOYYIBPAY_BASE_URL") ?? "https://toyyibpay.com");
    const authHeader = request.headers.get("Authorization") ?? "";

    if (!authHeader) {
      return json(request, { error: "LOGIN_REQUIRED" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json(request, { error: "LOGIN_REQUIRED" }, 401);
    }

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id,display_name,full_name,subscription_status,subscription_ends_at,is_blocked")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return json(request, { error: "PROFILE_NOT_FOUND" }, 404);
    }

    if (profile.is_blocked || profile.subscription_status === "blocked") {
      return json(request, { error: "ACCOUNT_BLOCKED" }, 403);
    }

    const isPremium =
      profile.subscription_status === "premium" &&
      (!profile.subscription_ends_at || new Date(profile.subscription_ends_at).getTime() > Date.now());

    if (isPremium) {
      return json(request, { error: "PREMIUM_ALREADY_ACTIVE" }, 409);
    }

    const email = user.email ?? "";
    if (!email) {
      return json(request, { error: "EMAIL_REQUIRED" }, 400);
    }

    const displayName = profile.display_name || profile.full_name || user.user_metadata?.display_name || email;
    const externalReference = `PKSK-${user.id}-${Date.now()}`;
    const callbackUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/toyyibpay-callback`;

    const { data: payment, error: insertError } = await serviceClient
      .from("payment_requests")
      .insert({
        user_id: user.id,
        email,
        amount: PREMIUM_AMOUNT_RM,
        currency: "MYR",
        status: "pending",
        provider: "toyyibpay",
        payment_method: "toyyibpay",
        external_reference: externalReference,
        notes: "ToyyibPay online banking",
      })
      .select("id")
      .single();

    if (insertError || !payment) {
      throw new Error(insertError?.message ?? "Payment record could not be created.");
    }

    const billPayload = new URLSearchParams({
      userSecretKey: secretKey,
      categoryCode,
      billName: "PKSK Academy Premium",
      billDescription: "PKSK Academy Premium",
      billPriceSetting: "1",
      billPayorInfo: "1",
      billAmount: String(PREMIUM_AMOUNT_CENTS),
      billReturnUrl: RETURN_URL,
      billCallbackUrl: callbackUrl,
      billExternalReferenceNo: externalReference,
      billTo: displayName,
      billEmail: email,
      billPhone: "",
      billPaymentChannel: "0",
      billContentEmail: "Terima kasih kerana melanggan PKSK Academy Premium.",
    });

    const toyResponse = await fetch(`${baseUrl}/index.php/api/createBill`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: billPayload,
    });
    const toyBody = await toyResponse.json().catch(() => null);
    const billCode = extractBillCode(toyBody);

    if (!toyResponse.ok || !billCode) {
      await serviceClient
        .from("payment_requests")
        .update({
          status: "failed",
          provider_response: toJsonObject(toyBody),
          notes: "ToyyibPay bill creation failed",
        })
        .eq("id", payment.id);

      return json(request, { error: "TOYYIBPAY_BILL_FAILED", details: toyBody }, 502);
    }

    await serviceClient
      .from("payment_requests")
      .update({
        provider_bill_code: billCode,
        provider_response: toJsonObject(toyBody),
      })
      .eq("id", payment.id);

    return json(request, {
      paymentId: payment.id,
      billCode,
      paymentUrl: `${baseUrl}/${billCode}`,
      callbackUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ToyyibPay bill could not be created.";
    return json(request, { error: message }, 500);
  }
});

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

function extractBillCode(payload: unknown): string | null {
  if (Array.isArray(payload)) {
    const first = payload[0] as Record<string, unknown> | undefined;
    return typeof first?.BillCode === "string" ? first.BillCode : null;
  }

  if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;
    if (typeof object.BillCode === "string") {
      return object.BillCode;
    }
    if (typeof object.billCode === "string") {
      return object.billCode;
    }
  }

  return null;
}

function toJsonObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : { raw: payload };
}
