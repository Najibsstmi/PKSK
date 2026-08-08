import { requireSupabase } from "../lib/supabase";
import type { AdminKpis, AdminQuestionRow, AdminUserRow, SubscriptionPlan, UserRole } from "../types/access";

export async function fetchAdminKpis(): Promise<AdminKpis> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_get_kpis");

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }

  return data as AdminKpis;
}

export async function fetchAdminUsers(searchText: string, statusFilter: string): Promise<AdminUserRow[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_list_users", {
    search_text: searchText || null,
    status_filter: statusFilter || "all",
    page_number: 1,
    page_size: 50,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }

  return (data ?? []) as AdminUserRow[];
}

export async function fetchAdminQuestions(searchText: string): Promise<AdminQuestionRow[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_list_questions", {
    search_text: searchText || null,
    page_number: 1,
    page_size: 50,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }

  return (data ?? []) as AdminQuestionRow[];
}

export async function grantPremium(targetUserId: string, plan: SubscriptionPlan): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_grant_premium", {
    target_user_id: targetUserId,
    plan,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function extendPremium(targetUserId: string, plan: SubscriptionPlan): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_extend_premium", {
    target_user_id: targetUserId,
    plan,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function revokePremium(targetUserId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_revoke_premium", {
    target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function blockUser(targetUserId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_block_user", {
    target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function unblockUser(targetUserId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_unblock_user", {
    target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export async function setUserRole(targetUserId: string, role: UserRole): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("super_admin_set_role", {
    target_user_id: targetUserId,
    new_role: role,
  });

  if (error) {
    throw new Error(mapAdminMessage(error.message));
  }
}

export function mapAdminMessage(message: string): string {
  if (message.includes("ADMIN_REQUIRED")) {
    return "Akses admin diperlukan.";
  }
  if (message.includes("SUPER_ADMIN_REQUIRED")) {
    return "Akses super admin diperlukan.";
  }
  if (message.includes("USER_NOT_FOUND")) {
    return "Pengguna tidak ditemui.";
  }
  if (message.includes("INVALID_PLAN")) {
    return "Pelan premium tidak sah.";
  }
  if (message.includes("INVALID_ROLE")) {
    return "Role pengguna tidak sah.";
  }

  return message;
}
