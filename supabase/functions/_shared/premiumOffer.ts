export const PROMO_PLAN_CODE = "pksk_promo_2026_21d";
export const LIFETIME_PLAN_CODE = "lifetime";
export const PROMO_DEADLINE_UTC = "2026-10-11T15:59:59Z";

export type PremiumOffer = {
  planCode: typeof PROMO_PLAN_CODE | typeof LIFETIME_PLAN_CODE;
  displayName: string;
  priceRm: number;
  amountCents: number;
  durationDays: number | null;
  isPromotion: boolean;
};

const promoDeadlineMs = Date.parse(PROMO_DEADLINE_UTC);

export function getCurrentPremiumOffer(now: Date = new Date()): PremiumOffer {
  const isPromotion = now.getTime() <= promoDeadlineMs;

  if (isPromotion) {
    return {
      planCode: PROMO_PLAN_CODE,
      displayName: "Promosi Khas PKSK 2026",
      priceRm: 29,
      amountCents: 2900,
      durationDays: 21,
      isPromotion: true,
    };
  }

  return {
    planCode: LIFETIME_PLAN_CODE,
    displayName: "PKSK Academy Premium",
    priceRm: 49,
    amountCents: 4900,
    durationDays: null,
    isPromotion: false,
  };
}

export function getOfferForAmount(amount: number | string): PremiumOffer | null {
  const value = Number(amount);
  if (value === 29) {
    return {
      planCode: PROMO_PLAN_CODE,
      displayName: "Promosi Khas PKSK 2026",
      priceRm: 29,
      amountCents: 2900,
      durationDays: 21,
      isPromotion: true,
    };
  }

  if (value === 49) {
    return {
      planCode: LIFETIME_PLAN_CODE,
      displayName: "PKSK Academy Premium",
      priceRm: 49,
      amountCents: 4900,
      durationDays: null,
      isPromotion: false,
    };
  }

  return null;
}
