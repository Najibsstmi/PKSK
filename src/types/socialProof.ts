export type RecentPremiumSubscriber = {
  id: string;
  displayName: string;
  subscribedAt?: string | null;
};

export type SocialProofItem =
  | {
      type: "legacy";
      id: string;
      displayName: string;
    }
  | {
      type: "real";
      id: string;
      displayName: string;
      subscribedAt?: string | null;
    };
