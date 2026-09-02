export type ZohoFieldMappingRow = {
  field_label: string;
  field_name: string | null;
  field_id: string | null;
  is_required: boolean;
  last_verified_at: string | null;
};

export type ZohoBackfillPreview = {
  total_auth_users: number;
  with_profile: number;
  missing_profile: number;
  total_prospects?: number;
  prospects_with_consent?: number;
  prospects_eligible?: number;
  eligible_users: number;
  prospects: number;
  premium_excluded?: number;
  premium: number;
  expired: number;
  blocked: number;
  blocked_users?: number;
  invalid_email: number;
  deleted_users: number;
  admin_internal_excluded: number;
  admin_excluded?: number;
  marketing_consent_true: number;
  marketing_consent_missing: number;
  marketing_consent_declined: number;
  marketing_consent_false_or_unknown: number;
  consent_missing?: number;
  consent_declined?: number;
  unsubscribed: number;
  not_confirmed_for_marketing: number;
};

export type ZohoDashboard = {
  queue_pending: number;
  queue_processing: number;
  queue_failed: number;
  queue_succeeded: number;
  queue_skipped: number;
  last_successful_sync: string | null;
  last_failed_sync: string | null;
  field_mappings: ZohoFieldMappingRow[];
  preview: ZohoBackfillPreview;
};

export type ZohoConnectionResult = {
  ok: boolean;
  connected: boolean;
  token?: {
    expiresIn: number | null;
    apiDomain: string | null;
  };
  list?: Record<string, unknown>;
  counts?: {
    active: number | null;
    unsubscribed: number | null;
  };
  fieldMapping?: Array<{
    label: string;
    fieldName: string | null;
    fieldId: string | null;
  }>;
};

export type ZohoProcessResult = {
  processed: number;
  synced: number;
  skipped: number;
  failed: number;
};

export type ZohoBackfillRunResult = {
  ok: boolean;
  backfill?: {
    ok: boolean;
    limit: number;
    enqueued: number;
  };
  processed?: ZohoProcessResult;
};

export type ZohoRetryResult = {
  ok: boolean;
  retry?: {
    ok: boolean;
    count: number;
    evaluated?: number;
    retried?: number;
    skipped?: number;
    duplicates?: number;
  };
  processed?: ZohoProcessResult;
};

export type ZohoSingleUserSyncResult = {
  ok: boolean;
  queued?: {
    ok: boolean;
    user_id: string;
    queue_id: string;
  };
  processed?: ZohoProcessResult;
};
