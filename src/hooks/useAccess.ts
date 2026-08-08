import { useMemo } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccessFlags, AccessStatus } from "../types/access";
import type { ProfileRow } from "../types/database";

export function useAccess(session: Session | null, profile: ProfileRow | null, accessStatus: AccessStatus | null): AccessFlags {
  return useMemo(() => {
    const isLoggedIn = Boolean(session?.user);
    const isBlocked = Boolean(accessStatus?.is_blocked ?? profile?.is_blocked ?? profile?.subscription_status === "blocked");
    const isExpired = Boolean(accessStatus?.is_expired ?? profile?.subscription_status === "expired");
    const isPremium = Boolean(accessStatus?.is_premium) && !isBlocked && !isExpired;
    const profileIsAdmin = profile?.role === "admin" || profile?.role === "super_admin";
    const profileIsSuperAdmin = profile?.role === "super_admin";
    const isAdmin = Boolean(accessStatus?.is_admin ?? profileIsAdmin) && !isBlocked;
    const isSuperAdmin = Boolean(accessStatus?.is_super_admin ?? profileIsSuperAdmin) && !isBlocked;

    return {
      isGuest: !isLoggedIn,
      isLoggedIn,
      isPremium,
      isExpired,
      isBlocked,
      isAdmin,
      isSuperAdmin,
      canUsePremiumFeature: () => isLoggedIn && isPremium && !isBlocked,
    };
  }, [accessStatus, profile, session?.user]);
}
