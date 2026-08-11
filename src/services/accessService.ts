import { requireSupabase, supabase } from "../lib/supabase";
import type { AccessStatus, AppSettings } from "../types/access";

const defaultSettings: AppSettings = {
  free_preview_section_a_limit: 15,
  free_preview_section_b_limit: 20,
  free_preview_section_c_enabled: false,
};

export async function fetchAccessStatus(): Promise<AccessStatus> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_my_access_status");

  if (error) {
    throw new Error(error.message);
  }

  return data as AccessStatus;
}

export async function recordLastLogin(): Promise<void> {
  if (!supabase) {
    return;
  }

  await supabase.rpc("record_last_login");
}

export async function fetchAppSettings(): Promise<AppSettings> {
  if (!supabase) {
    return defaultSettings;
  }

  const { data, error } = await supabase.rpc("get_public_app_settings");

  if (error) {
    return defaultSettings;
  }

  const payload = data as Partial<AppSettings>;
  return {
    free_preview_section_a_limit: Number(payload.free_preview_section_a_limit ?? defaultSettings.free_preview_section_a_limit),
    free_preview_section_b_limit: Number(payload.free_preview_section_b_limit ?? defaultSettings.free_preview_section_b_limit),
    free_preview_section_c_enabled: Boolean(payload.free_preview_section_c_enabled ?? defaultSettings.free_preview_section_c_enabled),
  };
}
