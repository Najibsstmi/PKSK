import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, json, requireEnv } from "../_shared/cors.ts";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const REQUIRED_FIELD_LABELS = [
  "Contact Email",
  "Supabase User ID",
  "Subscription Status",
  "Subscription Plan",
  "Is Premium",
  "Is Blocked",
  "PKSK Source",
  "Last Synced At",
];

type Action =
  | "test_connection"
  | "preview_backfill"
  | "run_backfill"
  | "process_queue"
  | "retry_failed"
  | "sync_single_user";

type RequestPayload = {
  action?: Action;
  batchSize?: number;
  email?: string;
  userId?: string;
};

type SupabaseClient = ReturnType<typeof createClient>;

type AuthUser = {
  id: string;
};

type QueueItem = {
  id: string;
  user_id: string;
  event_type: string;
  desired_segment: string | null;
  source: string | null;
  attempt_count: number;
};

type DesiredContactState = {
  syncable: boolean;
  skip_reason: string | null;
  user_id: string;
  email: string | null;
  email_masked: string | null;
  full_name: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  subscription_status: string;
  subscription_plan: string | null;
  registration_date: string | null;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
  is_premium: boolean;
  is_blocked: boolean;
  marketing_consent: boolean;
  email_marketing_unsubscribed_at: string | null;
  marketing_eligible: boolean;
  desired_segment: "prospect" | "premium" | "expired" | "blocked" | "skipped";
  source: string;
  last_synced_at: string;
};

type ZohoConfig = {
  accountsBaseUrl: string;
  campaignsBaseUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  listKey: string;
};

type ZohoToken = {
  accessToken: string;
  expiresIn: number | null;
  apiDomain: string | null;
};

type ZohoField = {
  displayName: string;
  fieldName: string;
  fieldId: string | null;
};

type ZohoFieldMapping = Record<string, ZohoField>;

type ProcessResult = {
  processed: number;
  synced: number;
  skipped: number;
  failed: number;
};

class SafeError extends Error {
  code: string;
  retryable: boolean;
  details: Record<string, unknown>;

  constructor(code: string, message: string, retryable = false, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

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
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const userClient = createAuthorizedClient(request, supabaseUrl, anonKey);
    await assertAdmin(request, userClient, serviceClient, serviceRoleKey);

    const payload = await readPayload(request);
    const action = payload.action ?? "test_connection";
    const batchSize = clampBatchSize(payload.batchSize);

    if (action === "test_connection") {
      return json(request, await testConnection(serviceClient));
    }

    if (action === "preview_backfill") {
      const { data, error } = await userClient.rpc("admin_zoho_backfill_preview");
      if (error) {
        throw new SafeError("PREVIEW_FAILED", error.message);
      }
      return json(request, { ok: true, preview: data });
    }

    if (action === "run_backfill") {
      const { data, error } = await userClient.rpc("admin_zoho_enqueue_backfill", { p_limit: batchSize });
      if (error) {
        throw new SafeError("BACKFILL_ENQUEUE_FAILED", error.message);
      }
      const processed = await processQueue(serviceClient, batchSize);
      return json(request, { ok: true, backfill: data, processed });
    }

    if (action === "retry_failed") {
      const { data, error } = await userClient.rpc("admin_zoho_retry_failed");
      if (error) {
        throw new SafeError("RETRY_FAILED", error.message);
      }
      const processed = await processQueue(serviceClient, batchSize);
      return json(request, { ok: true, retry: data, processed });
    }

    if (action === "sync_single_user") {
      const { data, error } = await userClient.rpc("admin_zoho_enqueue_single_user", {
        p_email: payload.email?.trim() || null,
        p_user_id: payload.userId?.trim() || null,
      });
      if (error) {
        throw new SafeError("SINGLE_USER_ENQUEUE_FAILED", error.message);
      }
      const processed = await processQueue(serviceClient, 1);
      return json(request, { ok: true, queued: data, processed });
    }

    if (action === "process_queue") {
      const processed = await processQueue(serviceClient, batchSize);
      return json(request, { ok: true, processed });
    }

    return json(request, { error: "Unknown action" }, 400);
  } catch (error) {
    const safe = toSafeError(error);
    return json(request, { error: safe.code, message: safe.message, details: safe.details }, statusForError(safe));
  }
});

async function readPayload(request: Request): Promise<RequestPayload> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    return {
      action: parseAction(body.action),
      batchSize: typeof body.batchSize === "number" ? body.batchSize : Number(body.batchSize ?? DEFAULT_BATCH_SIZE),
      email: cleanString(body.email),
      userId: cleanString(body.userId ?? body.user_id),
    };
  } catch {
    return {};
  }
}

function parseAction(value: unknown): Action | undefined {
  const action = cleanString(value) as Action;
  return [
    "test_connection",
    "preview_backfill",
    "run_backfill",
    "process_queue",
    "retry_failed",
    "sync_single_user",
  ].includes(action)
    ? action
    : undefined;
}

function createAuthorizedClient(request: Request, supabaseUrl: string, anonKey: string): SupabaseClient {
  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader) {
    throw new SafeError("LOGIN_REQUIRED", "Sila log masuk sebagai admin.", false);
  }

  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

async function assertAdmin(request: Request, userClient: SupabaseClient, serviceClient: SupabaseClient, serviceRoleKey: string): Promise<AuthUser> {
  if (cleanBearerToken(request.headers.get("Authorization") ?? "") === serviceRoleKey) {
    return { id: "service_role" };
  }

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    throw new SafeError("LOGIN_REQUIRED", "Sesi admin tidak sah.", false);
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role,is_blocked,subscription_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new SafeError("ADMIN_CHECK_FAILED", profileError.message);
  }

  const role = cleanString((profile as Record<string, unknown> | null)?.role);
  const isBlocked = Boolean((profile as Record<string, unknown> | null)?.is_blocked);
  const subscriptionStatus = cleanString((profile as Record<string, unknown> | null)?.subscription_status);
  if ((role !== "admin" && role !== "super_admin") || isBlocked || subscriptionStatus === "blocked") {
    throw new SafeError("ADMIN_REQUIRED", "Akses admin diperlukan.", false);
  }

  return { id: user.id };
}

function cleanBearerToken(authHeader: string): string {
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

async function testConnection(serviceClient: SupabaseClient): Promise<Record<string, unknown>> {
  const config = readZohoConfig();
  const token = await refreshZohoToken(config);
  const [fields, listDetails] = await Promise.all([
    fetchContactFields(config, token),
    fetchListDetails(config, token),
  ]);
  const [activeCount, unsubscribedCount] = await Promise.all([
    safeFetchSubscriberCount(config, token, "active"),
    safeFetchSubscriberCount(config, token, "unsub"),
  ]);
  const fieldMapping = buildFieldMapping(fields);
  const missingFields = REQUIRED_FIELD_LABELS.filter((label) => !fieldMapping[label]);
  await saveFieldMapping(serviceClient, fieldMapping);

  if (missingFields.length > 0) {
    throw new SafeError("ZOHO_CUSTOM_FIELDS_MISSING", "Ada custom field Zoho yang belum ditemui.", false, {
      missingFields,
      discoveredFields: Object.values(fieldMapping).map((field) => ({
        displayName: field.displayName,
        fieldName: field.fieldName,
        fieldId: field.fieldId,
      })),
    });
  }

  return {
    ok: true,
    connected: true,
    token: {
      expiresIn: token.expiresIn,
      apiDomain: token.apiDomain,
    },
    list: listDetails,
    counts: {
      active: activeCount,
      unsubscribed: unsubscribedCount,
    },
    fieldMapping: REQUIRED_FIELD_LABELS.map((label) => ({
      label,
      fieldName: fieldMapping[label]?.fieldName ?? null,
      fieldId: fieldMapping[label]?.fieldId ?? null,
    })),
  };
}

async function processQueue(serviceClient: SupabaseClient, batchSize: number): Promise<ProcessResult> {
  const { data, error } = await serviceClient.rpc("zoho_claim_pending_queue", {
    p_limit: batchSize,
    p_worker_id: "zoho-campaigns-sync",
  });

  if (error) {
    throw new SafeError("QUEUE_CLAIM_FAILED", error.message);
  }

  const queueItems = (data ?? []) as QueueItem[];
  if (queueItems.length === 0) {
    return { processed: 0, synced: 0, skipped: 0, failed: 0 };
  }

  const config = readZohoConfig();
  const token = await refreshZohoToken(config);
  const fields = await fetchContactFields(config, token);
  const fieldMapping = buildFieldMapping(fields);
  await saveFieldMapping(serviceClient, fieldMapping);

  const result: ProcessResult = { processed: 0, synced: 0, skipped: 0, failed: 0 };
  for (const item of queueItems) {
    result.processed += 1;
    try {
      const state = await fetchDesiredState(serviceClient, item);
      if (!state.syncable) {
        await markQueueSkipped(serviceClient, item, state, state.skip_reason ?? "SKIPPED");
        result.skipped += 1;
        continue;
      }

      const emailCompatibilityIssue = getZohoEmailCompatibilityIssue(state.email);
      if (emailCompatibilityIssue) {
        await markQueueSkipped(serviceClient, item, state, emailCompatibilityIssue);
        result.skipped += 1;
        continue;
      }

      if (state.desired_segment === "blocked" || state.is_blocked) {
        await unsubscribeContact(config, token, state);
        await markQueueSucceeded(serviceClient, item, state, { action: "unsubscribed_blocked" }, "blocked_unsubscribed");
        result.synced += 1;
        continue;
      }

      if (await isUnsubscribedInZoho(config, token, state.email ?? "")) {
        await markUserUnsubscribed(serviceClient, state.user_id, "zoho");
        await markQueueSkipped(serviceClient, item, state, "ZOHO_UNSUBSCRIBED");
        result.skipped += 1;
        continue;
      }

      const response = await upsertZohoContact(config, token, state, fieldMapping);
      await markQueueSucceeded(serviceClient, item, state, response, "synced");
      result.synced += 1;
      await delay(140);
    } catch (error) {
      const safe = toSafeError(error);
      await markQueueFailed(serviceClient, item, safe);
      result.failed += 1;
    }
  }

  return result;
}

async function fetchDesiredState(serviceClient: SupabaseClient, item: QueueItem): Promise<DesiredContactState> {
  const { data, error } = await serviceClient.rpc("zoho_get_contact_desired_state", {
    p_user_id: item.user_id,
    p_source: item.source ?? item.event_type,
  });

  if (error) {
    throw new SafeError("DESIRED_STATE_FAILED", error.message);
  }

  return data as DesiredContactState;
}

function readZohoConfig(): ZohoConfig {
  return {
    accountsBaseUrl: normalizeBaseUrl(requireEnv("ZOHO_ACCOUNTS_BASE_URL")),
    campaignsBaseUrl: normalizeBaseUrl(requireEnv("ZOHO_CAMPAIGNS_BASE_URL")),
    clientId: requireEnv("ZOHO_CLIENT_ID"),
    clientSecret: requireEnv("ZOHO_CLIENT_SECRET"),
    refreshToken: requireEnv("ZOHO_REFRESH_TOKEN"),
    listKey: requireEnv("ZOHO_CAMPAIGNS_LIST_KEY"),
  };
}

async function refreshZohoToken(config: ZohoConfig): Promise<ZohoToken> {
  const endpoint = `${config.accountsBaseUrl}/oauth/v2/token`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok || !cleanString(body.access_token)) {
    throw new SafeError("ZOHO_TOKEN_REFRESH_FAILED", safeZohoMessage(body, response), isTransientStatus(response.status), {
      httpStatus: response.status,
      error: cleanString(body.error),
    });
  }

  return {
    accessToken: cleanString(body.access_token),
    expiresIn: Number.isFinite(Number(body.expires_in)) ? Number(body.expires_in) : null,
    apiDomain: cleanString(body.api_domain) || null,
  };
}

async function fetchContactFields(config: ZohoConfig, token: ZohoToken): Promise<ZohoField[]> {
  const payload = await fetchZohoJson(config, token, "/api/v1.1/contact/allfields", {
    type: "json",
  });
  const rawFields = readZohoArray(payload, [
    "response.fieldname",
    "response.fieldnames.fieldname",
    "response.fieldnames",
    "fieldname",
    "fieldnames.fieldname",
    "fieldnames",
  ]);
  const fields = rawFields
    .map((field) => {
      const record = field as Record<string, unknown>;
      return {
        displayName: cleanString(record.DISPLAY_NAME ?? record.display_name),
        fieldName: cleanString(record.FIELD_NAME ?? record.field_name),
        fieldId: cleanString(record.FIELD_ID ?? record.field_id) || null,
      };
    })
    .filter((field) => field.displayName && field.fieldName);

  if (fields.length === 0) {
    const code = zohoCode(payload);
    throw new SafeError("ZOHO_FIELDS_EMPTY", safeZohoMessage(payload, { status: 200, statusText: "OK" } as Response), isRetryableZohoCode(code), {
      code,
      response: redactZohoPayload(payload),
    });
  }

  return fields;
}

async function fetchListDetails(config: ZohoConfig, token: ZohoToken): Promise<Record<string, unknown>> {
  const payload = await fetchZohoJson(config, token, "/api/v1.1/getlistadvanceddetails", {
    resfmt: "JSON",
    listkey: config.listKey,
    fromindex: "1",
    range: "1",
  });
  const status = zohoStatus(payload);
  const code = zohoCode(payload);

  if (status !== "success" && code !== "0") {
    throw new SafeError("ZOHO_LIST_CHECK_FAILED", safeZohoMessage(payload, { status: 200, statusText: "OK" } as Response));
  }

  return {
    status,
    listDetails: summarizeZohoValue(readNested(payload, ["list_details", "response.list_details", "listdetails", "response.listdetails"])),
    contactStats: summarizeZohoValue(readNested(payload, ["contact_stats", "response.contact_stats", "contactstats", "response.contactstats"])),
  };
}

async function safeFetchSubscriberCount(config: ZohoConfig, token: ZohoToken, status: "active" | "unsub"): Promise<number | null> {
  try {
    return await fetchSubscriberCount(config, token, status);
  } catch {
    return null;
  }
}

async function fetchSubscriberCount(config: ZohoConfig, token: ZohoToken, status: "active" | "unsub"): Promise<number | null> {
  const payload = await fetchZohoJson(config, token, "/api/v1.1/listsubscriberscount", {
    resfmt: "JSON",
    listkey: config.listKey,
    status,
  });
  const count = Number(readNested(payload, ["no_of_contacts", "response.no_of_contacts", "count", "response.count"]));
  return Number.isFinite(count) ? count : null;
}

async function fetchUnsubscribedContacts(config: ZohoConfig, token: ZohoToken, fromIndex: number): Promise<Record<string, unknown>[]> {
  const payload = await fetchZohoJson(config, token, "/api/v1.1/getlistsubscribers", {
    resfmt: "JSON",
    listkey: config.listKey,
    sort: "desc",
    fromindex: String(fromIndex),
    range: "200",
    status: "unsub",
  });

  return readZohoArray(payload, ["list_of_details", "response.list_of_details"]);
}

async function isUnsubscribedInZoho(config: ZohoConfig, token: ZohoToken, email: string): Promise<boolean> {
  const targetEmail = email.trim().toLowerCase();
  if (!targetEmail) {
    return false;
  }

  for (let fromIndex = 1; fromIndex <= 1001; fromIndex += 200) {
    const contacts = await fetchUnsubscribedContacts(config, token, fromIndex);
    if (contacts.some((contact) => cleanString(contact.contact_email ?? contact["Contact Email"]).toLowerCase() === targetEmail)) {
      return true;
    }
    if (contacts.length < 200) {
      return false;
    }
  }

  return false;
}

async function upsertZohoContact(config: ZohoConfig, token: ZohoToken, state: DesiredContactState, fieldMapping: ZohoFieldMapping): Promise<Record<string, unknown>> {
  const contactInfo = buildContactInfo(state, fieldMapping);
  const payload = await postZohoForm(config, token, "/api/v1.1/json/listsubscribe", {
    resfmt: "JSON",
    listkey: config.listKey,
    contactinfo: JSON.stringify(contactInfo),
    source: state.source || "PKSK Academy",
  });

  const status = zohoStatus(payload);
  const code = zohoCode(payload);
  if (status !== "success" && code !== "0") {
    throw new SafeError("ZOHO_CONTACT_UPSERT_FAILED", safeZohoMessage(payload, { status: 200, statusText: "OK" } as Response), isRetryableZohoCode(code), {
      code,
      response: redactZohoPayload(payload),
    });
  }

  return redactZohoPayload(payload);
}

async function unsubscribeContact(config: ZohoConfig, token: ZohoToken, state: DesiredContactState): Promise<Record<string, unknown>> {
  return postZohoForm(config, token, "/api/v1.1/json/listunsubscribe", {
    resfmt: "JSON",
    listkey: config.listKey,
    contactinfo: JSON.stringify({ "Contact Email": state.email }),
  });
}

async function fetchZohoJson(config: ZohoConfig, token: ZohoToken, path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const endpoint = buildZohoUrl(config.campaignsBaseUrl, path, params);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Authorization: `Zoho-oauthtoken ${token.accessToken}` },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new SafeError("ZOHO_API_FAILED", safeZohoMessage(payload, response), isTransientStatus(response.status), {
      httpStatus: response.status,
    });
  }

  return payload;
}

async function postZohoForm(config: ZohoConfig, token: ZohoToken, path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(`${config.campaignsBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new SafeError("ZOHO_API_FAILED", safeZohoMessage(payload, response), isTransientStatus(response.status), {
      httpStatus: response.status,
    });
  }

  return payload;
}

function buildContactInfo(state: DesiredContactState, fieldMapping: ZohoFieldMapping): Record<string, string> {
  const lastSyncedAt = formatZohoDateTime(new Date());
  return {
    [fieldMapping["Contact Email"]?.displayName ?? "Contact Email"]: state.email ?? "",
    [fieldMapping["First Name"]?.displayName ?? "First Name"]: state.first_name ?? state.display_name ?? "",
    [fieldMapping["Last Name"]?.displayName ?? "Last Name"]: state.last_name ?? "",
    [fieldMapping["Supabase User ID"]?.displayName ?? "Supabase User ID"]: state.user_id,
    [fieldMapping["Subscription Status"]?.displayName ?? "Subscription Status"]: state.subscription_status,
    [fieldMapping["Subscription Plan"]?.displayName ?? "Subscription Plan"]: state.subscription_plan ?? "",
    [fieldMapping["Is Premium"]?.displayName ?? "Is Premium"]: state.is_premium ? "true" : "false",
    [fieldMapping["Is Blocked"]?.displayName ?? "Is Blocked"]: state.is_blocked ? "true" : "false",
    [fieldMapping["PKSK Source"]?.displayName ?? "PKSK Source"]: state.source || "PKSK Academy",
    [fieldMapping["Last Synced At"]?.displayName ?? "Last Synced At"]: lastSyncedAt,
  };
}

function getZohoEmailCompatibilityIssue(email: string | null): string | null {
  const cleanEmail = cleanString(email).toLowerCase();
  const [localPart] = cleanEmail.split("@");
  if (localPart.includes("+")) {
    return "ZOHO_PLUS_EMAIL_UNSUPPORTED";
  }

  return null;
}

function buildFieldMapping(fields: ZohoField[]): ZohoFieldMapping {
  return Object.fromEntries(fields.map((field) => [field.displayName, field]));
}

async function saveFieldMapping(serviceClient: SupabaseClient, fieldMapping: ZohoFieldMapping): Promise<void> {
  const rows = Object.values(fieldMapping)
    .filter((field) => REQUIRED_FIELD_LABELS.includes(field.displayName) || ["First Name", "Last Name"].includes(field.displayName))
    .map((field) => ({
      field_label: field.displayName,
      field_name: field.fieldName,
      field_id: field.fieldId,
      last_verified_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await serviceClient.from("zoho_contact_field_mappings").upsert(rows, { onConflict: "field_label" });
  if (error) {
    throw new SafeError("FIELD_MAPPING_SAVE_FAILED", error.message);
  }
}

async function markQueueSucceeded(
  serviceClient: SupabaseClient,
  item: QueueItem,
  state: DesiredContactState,
  response: Record<string, unknown>,
  contactStatus: string,
): Promise<void> {
  const now = new Date().toISOString();
  await updateQueue(serviceClient, item.id, {
    status: "succeeded",
    processed_at: now,
    locked_at: null,
    locked_by: null,
    last_error: null,
    last_response: response,
  });
  await updateProfileSyncState(serviceClient, state.user_id, {
    zoho_last_synced_at: now,
    zoho_last_sync_status: "success",
    zoho_last_sync_error: null,
    zoho_contact_status: contactStatus,
  });
  await insertLog(serviceClient, item, state, "sync_contact", "success", null, response);
}

async function markQueueSkipped(serviceClient: SupabaseClient, item: QueueItem, state: DesiredContactState, reason: string): Promise<void> {
  const now = new Date().toISOString();
  await updateQueue(serviceClient, item.id, {
    status: "skipped",
    processed_at: now,
    locked_at: null,
    locked_by: null,
    last_error: reason,
    last_response: { reason },
  });
  await updateProfileSyncState(serviceClient, state.user_id, {
    zoho_last_synced_at: now,
    zoho_last_sync_status: "skipped",
    zoho_last_sync_error: reason,
    zoho_contact_status: reason === "ZOHO_UNSUBSCRIBED" ? "unsubscribed" : "skipped",
  });
  await insertLog(serviceClient, item, state, "skip_contact", "skipped", reason, { reason });
}

async function markQueueFailed(serviceClient: SupabaseClient, item: QueueItem, error: SafeError): Promise<void> {
  const retryable = error.retryable && item.attempt_count < 6;
  const nextStatus = retryable ? "pending" : "failed";
  const nextAttemptAt = retryable ? new Date(Date.now() + retryDelayMs(item.attempt_count)).toISOString() : new Date().toISOString();
  await updateQueue(serviceClient, item.id, {
    status: nextStatus,
    next_attempt_at: nextAttemptAt,
    locked_at: null,
    locked_by: null,
    last_error: `${error.code}: ${error.message}`,
    last_response: error.details,
    processed_at: retryable ? null : new Date().toISOString(),
  });
  await updateProfileSyncState(serviceClient, item.user_id, {
    zoho_last_sync_status: nextStatus === "pending" ? "retrying" : "failed",
    zoho_last_sync_error: `${error.code}: ${error.message}`,
  });
  await insertLog(
    serviceClient,
    item,
    {
      user_id: item.user_id,
      email_masked: null,
      desired_segment: (item.desired_segment ?? "skipped") as DesiredContactState["desired_segment"],
    } as DesiredContactState,
    "sync_contact",
    retryable ? "retrying" : "failed",
    error.code,
    { message: error.message, retryable, nextAttemptAt },
  );
}

async function markUserUnsubscribed(serviceClient: SupabaseClient, userId: string, source: string): Promise<void> {
  const { error } = await serviceClient.rpc("zoho_update_profile_sync_state", {
    p_user_id: userId,
    p_payload: {
      email_marketing_unsubscribed_at: new Date().toISOString(),
      email_marketing_unsubscribe_source: source,
      zoho_contact_status: "unsubscribed",
    },
  });

  if (error) {
    throw new SafeError("UNSUBSCRIBE_STATE_SAVE_FAILED", error.message);
  }
}

async function updateQueue(serviceClient: SupabaseClient, queueId: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await serviceClient.from("zoho_contact_sync_queue").update(values).eq("id", queueId);
  if (error) {
    throw new SafeError("QUEUE_UPDATE_FAILED", error.message);
  }
}

async function updateProfileSyncState(serviceClient: SupabaseClient, userId: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await serviceClient.rpc("zoho_update_profile_sync_state", {
    p_user_id: userId,
    p_payload: values,
  });
  if (error) {
    throw new SafeError("PROFILE_SYNC_STATE_UPDATE_FAILED", error.message);
  }
}

async function insertLog(
  serviceClient: SupabaseClient,
  item: QueueItem,
  state: DesiredContactState,
  action: string,
  status: "success" | "failed" | "skipped" | "retrying" | "info",
  errorCode: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  await serviceClient.from("zoho_contact_sync_logs").insert({
    queue_id: item.id,
    user_id: state.user_id || item.user_id,
    email_masked: state.email_masked ?? null,
    action,
    desired_segment: state.desired_segment ?? item.desired_segment,
    status,
    attempt_count: item.attempt_count,
    error_code: errorCode,
    error_message: errorCode ? cleanString(details.message) : null,
    details,
  });
}

function readZohoArray(payload: Record<string, unknown>, paths: string[]): Record<string, unknown>[] {
  for (const path of paths) {
    const value = readNested(payload, [path]);

    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }

    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if ("DISPLAY_NAME" in record || "FIELD_NAME" in record || "display_name" in record || "field_name" in record) {
        return [record];
      }

      const records = Object.values(record).flatMap((item) => {
        if (Array.isArray(item)) {
          return item.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
        }

        return Boolean(item) && typeof item === "object" ? [item as Record<string, unknown>] : [];
      });
      if (records.length > 0) {
        return records;
      }
    }
  }

  return [];
}

function readNested(payload: Record<string, unknown>, paths: string[]): unknown {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (current && typeof current === "object") {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, payload);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function zohoStatus(payload: Record<string, unknown>): string {
  return cleanString(readNested(payload, ["status", "response.status"])).toLowerCase();
}

function zohoCode(payload: Record<string, unknown>): string {
  return cleanString(readNested(payload, ["code", "response.code"]));
}

function buildZohoUrl(baseUrl: string, path: string, params: Record<string, string>): string {
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function safeZohoMessage(payload: unknown, response: Pick<Response, "status" | "statusText">): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = cleanString(
      readNested(record, [
        "message",
        "response.message",
        "error_description",
        "response.error_description",
        "error",
        "response.error",
        "status",
        "response.status",
      ]),
    );
    if (message) {
      return message.slice(0, 260);
    }
  }
  return `${response.status} ${response.statusText}`.trim();
}

function redactZohoPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return { raw: cleanString(payload).slice(0, 260) };
  }

  const redacted = { ...(payload as Record<string, unknown>) };
  delete redacted.access_token;
  delete redacted.refresh_token;
  delete redacted.client_secret;
  return redacted;
}

function summarizeZohoValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.slice(0, 500);
  }
  return value ?? null;
}

function toSafeError(error: unknown): SafeError {
  if (error instanceof SafeError) {
    return error;
  }
  if (error instanceof Error) {
    return new SafeError("UNEXPECTED_ERROR", error.message);
  }
  return new SafeError("UNEXPECTED_ERROR", "Ralat tidak diketahui.");
}

function statusForError(error: SafeError): number {
  if (error.code === "LOGIN_REQUIRED") {
    return 401;
  }
  if (error.code === "ADMIN_REQUIRED") {
    return 403;
  }
  if (error.code.endsWith("_MISSING")) {
    return 400;
  }
  return error.retryable ? 503 : 500;
}

function retryDelayMs(attemptCount: number): number {
  const exponent = Math.min(Math.max(attemptCount, 1), 6);
  return Math.round(60_000 * 2 ** (exponent - 1));
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryableZohoCode(code: string): boolean {
  return ["2101", "2502", "2701", "2704"].includes(code);
}

function clampBatchSize(value: unknown): number {
  const numeric = Number(value ?? DEFAULT_BATCH_SIZE);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.min(Math.max(Math.floor(numeric), 1), MAX_BATCH_SIZE);
}

function cleanString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value).trim() : "";
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function formatZohoDateTime(date: Date): string {
  const month = padTwoDigits(date.getUTCMonth() + 1);
  const day = padTwoDigits(date.getUTCDate());
  const year = date.getUTCFullYear();
  const hours = padTwoDigits(date.getUTCHours());
  const minutes = padTwoDigits(date.getUTCMinutes());
  const seconds = padTwoDigits(date.getUTCSeconds());
  return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
