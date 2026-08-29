type MetaPurchase = {
  amount?: number;
  currency?: string;
  externalReference?: string | null;
  paymentId?: string | null;
  providerBillCode?: string | null;
  providerReference?: string | null;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const purchaseStoragePrefix = "pksk-meta-purchase-";
const trackedPurchaseKeys = new Set<string>();

export function trackPremiumPurchase(purchase: MetaPurchase): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return;
  }

  const eventId = buildPurchaseEventId(purchase);
  if (hasTrackedPurchase(eventId)) {
    return;
  }

  window.fbq(
    "track",
    "Purchase",
    {
      content_category: "premium_access",
      content_name: "PKSK Academy Premium",
      currency: purchase.currency ?? "MYR",
      value: purchase.amount ?? 49,
    },
    { eventID: eventId },
  );
  rememberTrackedPurchase(eventId);
}

function buildPurchaseEventId(purchase: MetaPurchase): string {
  const reference =
    clean(purchase.paymentId) ??
    clean(purchase.providerReference) ??
    clean(purchase.providerBillCode) ??
    clean(purchase.externalReference) ??
    "unknown";

  return `pksk-premium-${reference}`;
}

function hasTrackedPurchase(eventId: string): boolean {
  const storageKey = `${purchaseStoragePrefix}${eventId}`;
  if (trackedPurchaseKeys.has(storageKey)) {
    return true;
  }

  try {
    return window.sessionStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function rememberTrackedPurchase(eventId: string): void {
  const storageKey = `${purchaseStoragePrefix}${eventId}`;
  trackedPurchaseKeys.add(storageKey);

  try {
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    // Tracking should never block the payment result page.
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export {};
