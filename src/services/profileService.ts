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
  const { data, error } = await client
    .from("profiles")
    .upsert(
      {
        id: input.id,
        full_name: input.full_name,
        display_name: input.display_name,
        school: input.school,
        state: input.state,
        class_name: input.class_name,
        avatar: input.avatar,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
