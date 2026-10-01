export const PROMO_PLAN_CODE = "pksk_promo_2026_21d" as const;
export const LIFETIME_PLAN_CODE = "lifetime" as const;
export const PROMO_DEADLINE_UTC = "2026-10-11T15:59:59Z";

export type PremiumOffer = {
  planCode: typeof PROMO_PLAN_CODE | typeof LIFETIME_PLAN_CODE;
  displayName: string;
  price: number;
  currency: "MYR";
  durationDays: number | null;
  ctaLabel: string;
  accessText: string;
  headline: string;
  deadlineText?: string;
  isPromotion: boolean;
};

const promoDeadlineMs = Date.parse(PROMO_DEADLINE_UTC);

export function getCurrentPremiumOffer(now: Date = new Date()): PremiumOffer {
  const isPromotion = now.getTime() <= promoDeadlineMs;

  if (isPromotion) {
    return {
      planCode: PROMO_PLAN_CODE,
      displayName: "Promosi Khas PKSK 2026",
      price: 29,
      currency: "MYR",
      durationDays: 21,
      ctaLabel: "Dapatkan Premium RM29",
      accessText: "Akses Premium selama 21 hari",
      headline: "PROMOSI KHAS PKSK 2026",
      deadlineText: "Promosi sehingga 11 Oktober 2026 sahaja",
      isPromotion: true,
    };
  }

  return {
    planCode: LIFETIME_PLAN_CODE,
    displayName: "PKSK Academy Premium",
    price: 49,
    currency: "MYR",
    durationDays: null,
    ctaLabel: "Dapatkan Premium RM49",
    accessText: "Lifetime Premium",
    headline: "PKSK Academy Premium",
    isPromotion: false,
  };
}
