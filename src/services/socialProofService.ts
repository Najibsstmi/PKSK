import { supabase } from "../lib/supabase";
import type { RecentPremiumSubscriber } from "../types/socialProof";

type RecentPremiumSubscriberRpcRow = {
  id: string | null;
  display_name: string | null;
  subscribed_at: string | null;
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
    .map((item) => ({
      id: item.id ?? "",
      displayName: item.display_name?.trim() ?? "",
      subscribedAt: item.subscribed_at ?? "",
    }))
    .filter((item) => item.id && item.displayName && item.subscribedAt);
}
