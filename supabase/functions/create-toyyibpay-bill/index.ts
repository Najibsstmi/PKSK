import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, json, requireEnv } from "../_shared/cors.ts";

const PREMIUM_AMOUNT_RM = 49;
const PREMIUM_AMOUNT_CENTS = 4900;
const RETURN_URL = "https://pksk.cikgustem.com/payment-result";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  email_confirmed_at?: string | null;
};

type CheckoutCustomerPayload = {
  displayName?: string;
  email?: string;
  password?: string;
};

type CreateBillPayload = {
  customer?: CheckoutCustomerPayload;
};

type PaymentProfile = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  subscription_status: string | null;
  subscription_ends_at: string | null;
  is_blocked: boolean | null;
};

type CheckoutUser = {
  id: string;
  email: string;
  displayName: string;
};

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
    const requestPayload = await readRequestPayload(request);
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const authenticatedUser = authHeader ? await getAuthenticatedUser(supabaseUrl, anonKey, authHeader) : null;
    const checkoutUser = authenticatedUser
      ? await resolveAuthenticatedCheckoutUser(serviceClient, authenticatedUser)
      : await resolveGuestCheckoutUser(serviceClient, requestPayload.customer);

    const externalReference = `PKSK-${checkoutUser.id}-${Date.now()}`;
    const callbackUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/toyyibpay-callback`;

    const { data: payment, error: insertError } = await serviceClient
      .from("payment_requests")
      .insert({
        user_id: checkoutUser.id,
        email: checkoutUser.email,
        amount: PREMIUM_AMOUNT_RM,
        currency: "MYR",
        status: "pending",
        provider: "toyyibpay",
        payment_method: "toyyibpay",
        external_reference: externalReference,
        notes: authenticatedUser ? "ToyyibPay online banking" : "ToyyibPay checkout with customer signup",
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
      billTo: checkoutUser.displayName,
      billEmail: checkoutUser.email,
      billPhone: "",
      billPaymentChannel: "0",
      billContentEmail: "Terima kasih kerana melanggan PKSK Academy Premium.",
    });

    const toyEndpoint = buildCreateBillEndpoint(baseUrl);
    console.log("[create-toyyibpay-bill] Creating ToyyibPay bill", {
      paymentId: payment.id,
      endpointHost: getHostName(toyEndpoint),
      hasCategoryCode: Boolean(categoryCode),
    });

    const toyResponse = await fetch(toyEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: billPayload,
    });
    const toyBodyText = await toyResponse.text();
    const toyBody = parseToyyibPayResponse(toyBodyText);
    const billCode = extractBillCode(toyBody);

    if (!toyResponse.ok || !billCode) {
      const failureDetails = buildToyyibPayFailureDetails(toyResponse, toyBody, toyBodyText);
      console.error("[create-toyyibpay-bill] ToyyibPay bill creation failed", {
        paymentId: payment.id,
        httpStatus: toyResponse.status,
        details: failureDetails,
      });

      await serviceClient
        .from("payment_requests")
        .update({
          status: "failed",
          provider_response: toJsonObject(failureDetails),
          notes: "ToyyibPay bill creation failed",
        })
        .eq("id", payment.id);

      return json(request, { error: "TOYYIBPAY_BILL_FAILED", details: failureDetails }, 502);
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
    return json(request, { error: message }, statusForErrorMessage(message));
  }
});

async function readRequestPayload(request: Request): Promise<CreateBillPayload> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    return (await request.json()) as CreateBillPayload;
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

  return user as AuthUser;
}

async function resolveAuthenticatedCheckoutUser(serviceClient: ReturnType<typeof createClient>, user: AuthUser): Promise<CheckoutUser> {
  const email = cleanEmail(user.email ?? "");
  if (!email) {
    throw new Error("EMAIL_REQUIRED");
  }

  const profile = await ensureProfileExists(serviceClient, user.id, getMetadataDisplayName(user) || email);
  assertProfileCanPurchase(profile);

  return {
    id: user.id,
    email,
    displayName: profile.display_name || profile.full_name || getMetadataDisplayName(user) || email,
  };
}

async function resolveGuestCheckoutUser(serviceClient: ReturnType<typeof createClient>, customer?: CheckoutCustomerPayload): Promise<CheckoutUser> {
  const displayName = (customer?.displayName ?? "").trim();
  const email = cleanEmail(customer?.email ?? "");
  const password = (customer?.password ?? "").trim();

  if (!displayName || !email || !password) {
    throw new Error("CUSTOMER_INFO_REQUIRED");
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error("INVALID_EMAIL");
  }
  if (password.length < 6) {
    throw new Error("PASSWORD_TOO_SHORT");
  }

  const user = await findAuthUserByEmail(serviceClient, email);
  if (!user) {
    throw new Error("CHECKOUT_SIGNUP_REQUIRED");
  }

  const profile = await ensureProfileExists(serviceClient, user.id, displayName);
  assertProfileCanPurchase(profile);

  return {
    id: user.id,
    email,
    displayName: profile.display_name || profile.full_name || displayName,
  };
}

async function findAuthUserByEmail(serviceClient: ReturnType<typeof createClient>, email: string): Promise<AuthUser | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find((user) => cleanEmail(user.email ?? "") === email);
    if (match) {
      return match as AuthUser;
    }
    if (data.users.length < 1000) {
      return null;
    }
  }

  return null;
}

async function ensureProfileExists(serviceClient: ReturnType<typeof createClient>, userId: string, displayName: string): Promise<PaymentProfile> {
  const { data: profile, error } = await serviceClient
    .from("profiles")
    .select("id,display_name,full_name,subscription_status,subscription_ends_at,is_blocked")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (profile) {
    return profile as PaymentProfile;
  }

  const { error: insertError } = await serviceClient.from("profiles").insert({
    id: userId,
    full_name: displayName,
    display_name: displayName,
  });

  if (insertError && insertError.code !== "23505") {
    throw new Error(insertError.message);
  }

  return {
    id: userId,
    display_name: displayName,
    full_name: displayName,
    subscription_status: "free",
    subscription_ends_at: null,
    is_blocked: false,
  };
}

function assertProfileCanPurchase(profile: PaymentProfile) {
  if (profile.is_blocked || profile.subscription_status === "blocked") {
    throw new Error("ACCOUNT_BLOCKED");
  }

  const isPremium =
    profile.subscription_status === "premium" &&
    (!profile.subscription_ends_at || new Date(profile.subscription_ends_at).getTime() > Date.now());

  if (isPremium) {
    throw new Error("PREMIUM_ALREADY_ACTIVE");
  }
}

function getMetadataDisplayName(user: AuthUser): string {
  const metadata = user.user_metadata ?? {};
  const displayName = metadata.display_name ?? metadata.full_name;
  return typeof displayName === "string" ? displayName.trim() : "";
}

function cleanEmail(value: string): string {
  return value.trim().toLowerCase();
}

function statusForErrorMessage(message: string): number {
  if (message === "CUSTOMER_INFO_REQUIRED" || message === "INVALID_EMAIL" || message === "PASSWORD_TOO_SHORT" || message === "CHECKOUT_SIGNUP_REQUIRED" || message === "EMAIL_REQUIRED") {
    return 400;
  }
  if (message === "ACCOUNT_BLOCKED") {
    return 403;
  }
  if (message === "PREMIUM_ALREADY_ACTIVE") {
    return 409;
  }
  return 500;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function buildCreateBillEndpoint(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);

  if (normalized.endsWith("/index.php/api/createBill")) {
    return normalized;
  }
  if (normalized.endsWith("/index.php/api")) {
    return `${normalized}/createBill`;
  }

  return `${normalized}/index.php/api/createBill`;
}

function getHostName(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
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

function buildToyyibPayFailureDetails(response: Response, payload: unknown, rawText: string): Record<string, unknown> {
  return {
    httpStatus: response.status,
    httpStatusText: response.statusText,
    response: payload,
    responseText: typeof payload === "string" ? payload : rawText.trim().slice(0, 500),
  };
}
