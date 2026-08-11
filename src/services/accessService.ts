import { requireSupabase, supabase } from "../lib/supabase";
import type { AccessStatus, AppSettings } from "../types/access";

const defaultSettings: AppSettings = {
  free_preview_section_a_limit: 15,
  free_preview_section_b_limit: 20,
  free_preview_section_c_enabled: false,
  payment_provider: "manual_whatsapp",
  payment_price: 49,
  payment_currency: "MYR",
  payment_plan_code: "lifetime",
  payment_whatsapp_number: "60197259548",
  payment_account_name: "PESONA STORE",
  payment_bank_name: "Maybank",
  payment_account_number: "551146529325",
  payment_qr_image_url: "/assets/duitnow-qr-pesona-store.png",
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
    payment_provider: String(payload.payment_provider ?? defaultSettings.payment_provider),
    payment_price: Number(payload.payment_price ?? defaultSettings.payment_price),
    payment_currency: String(payload.payment_currency ?? defaultSettings.payment_currency),
    payment_plan_code: (payload.payment_plan_code ?? defaultSettings.payment_plan_code) as AppSettings["payment_plan_code"],
    payment_whatsapp_number: String(payload.payment_whatsapp_number ?? defaultSettings.payment_whatsapp_number),
    payment_account_name: String(payload.payment_account_name ?? defaultSettings.payment_account_name),
    payment_bank_name: String(payload.payment_bank_name ?? defaultSettings.payment_bank_name),
    payment_account_number: String(payload.payment_account_number ?? defaultSettings.payment_account_number),
    payment_qr_image_url: String(payload.payment_qr_image_url ?? defaultSettings.payment_qr_image_url),
  };
}
