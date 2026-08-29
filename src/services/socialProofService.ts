import { supabase } from "../lib/supabase";
import type { PublicSocialProofStats } from "../types/access";
import type { RecentPremiumSubscriber } from "../types/socialProof";

type RecentPremiumSubscriberRpcRow = {
  id?: string | null;
  display_name: string | null;
  subscribed_at?: string | null;
};

export async function fetchRecentPremiumSubscribers(limit = 12): Promise<RecentPremiumSubscriber[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc("get_recent_premium_subscribers", {
    p_limit: limit,
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return (data as RecentPremiumSubscriberRpcRow[])
    .map((item, index) => ({
      id: item.id ?? `recent-premium-${index}-${item.display_name?.trim().toLowerCase().replace(/\s+/g, "-") ?? "user"}`,
      displayName: item.display_name?.trim() ?? "",
      subscribedAt: item.subscribed_at ?? null,
    }))
    .filter((item) => item.id && item.displayName);
}

export async function fetchPublicSocialProofStats(): Promise<PublicSocialProofStats | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_public_social_proof_stats");

  if (error || !data) {
    return null;
  }

  const payload = data as Partial<PublicSocialProofStats>;
  const registeredUsers = Math.max(0, Number(payload.registered_users ?? 0));
  const displayUsers = Math.max(registeredUsers, Number(payload.display_users ?? registeredUsers));

  return {
    registered_users: registeredUsers,
    display_users: displayUsers,
  };
}
