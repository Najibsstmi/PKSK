import { requireSupabase } from "../lib/supabase";
import type { ProfileRow } from "../types/database";

export type ProfileInput = {
  id: string;
  full_name: string;
  display_name: string;
  school: string;
  state: string;
  class_name: string;
  avatar: string;
  marketing_consent?: boolean;
};

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function saveProfile(input: ProfileInput): Promise<ProfileRow> {
  const client = requireSupabase();
  const profilePayload = {
    id: input.id,
    full_name: input.full_name,
    display_name: input.display_name,
    school: input.school,
    state: input.state,
    class_name: input.class_name,
    avatar: input.avatar,
    ...(typeof input.marketing_consent === "boolean"
      ? {
          marketing_consent: input.marketing_consent,
          marketing_consent_at: input.marketing_consent ? new Date().toISOString() : null,
          marketing_consent_source: input.marketing_consent ? "profile" : null,
          marketing_consent_revoked_at: input.marketing_consent ? null : new Date().toISOString(),
        }
      : {}),
  };
  const { data, error } = await client
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
