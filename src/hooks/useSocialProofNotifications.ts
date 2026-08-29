import { useCallback, useEffect, useRef, useState } from "react";
import { legacySocialProofNames } from "../data/legacySocialProofNames";
import { fetchRecentPremiumSubscribers } from "../services/socialProofService";
import type { RecentPremiumSubscriber, SocialProofItem } from "../types/socialProof";

const STORAGE_VERSION = "v4";
const SHOWN_ITEM_KEYS_KEY = `pksk-shown-social-proof-item-keys-${STORAGE_VERSION}`;
const SHOWN_NAMES_KEY = `pksk-shown-social-proof-names-${STORAGE_VERSION}`;
const SHOWN_COUNT_KEY = `pksk-shown-social-proof-count-${STORAGE_VERSION}`;
const DISMISSED_COUNT_KEY = `pksk-dismissed-social-proof-count-${STORAGE_VERSION}`;
const MAX_NOTIFICATIONS_PER_SESSION = 20;
const MAX_DISMISSES_PER_SESSION = 6;

const legacySocialProofItems: SocialProofItem[] = legacySocialProofNames.map((displayName) => ({
  type: "legacy",
  id: `legacy-${displayName.toLowerCase().replace(/\s+/g, "-")}`,
  displayName,
}));

function randomMs(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function itemStorageKey(item: SocialProofItem): string {
  return `${item.type}:${item.id}`;
}

function readStringSet(key: string): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function writeStringSet(key: string, values: Set<string>): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(Array.from(values)));
  } catch {
    return;
  }
}

function readSessionCount(key: string): number {
  try {
    return Number(window.sessionStorage.getItem(key) ?? 0);
  } catch {
    return 0;
  }
}

function writeSessionCount(key: string, value: number): void {
  try {
    window.sessionStorage.setItem(key, `${value}`);
  } catch {
    return;
  }
}

function toRealSocialProofItems(subscribers: RecentPremiumSubscriber[]): SocialProofItem[] {
  return subscribers.map((subscriber) => ({
    type: "real",
    id: subscriber.id,
    displayName: subscriber.displayName,
    subscribedAt: subscriber.subscribedAt,
  }));
}

function chooseNextItem(items: SocialProofItem[]): SocialProofItem {
  return items.find((item) => item.type === "real") ?? items[Math.floor(Math.random() * items.length)];
}

export function useSocialProofNotifications(enabled: boolean) {
  const [realSubscribers, setRealSubscribers] = useState<RecentPremiumSubscriber[]>([]);
  const [currentItem, setCurrentItem] = useState<SocialProofItem | null>(null);

  const enabledRef = useRef(enabled);
  const fetchedRef = useRef(false);
  const fetchSettledRef = useRef(false);
  const itemsRef = useRef<SocialProofItem[]>(legacySocialProofItems);
  const currentRef = useRef<SocialProofItem | null>(null);
  const shownItemKeysRef = useRef<Set<string>>(new Set());
  const shownNamesRef = useRef<Set<string>>(new Set());
  const shownCountRef = useRef(0);
  const dismissedCountRef = useRef(0);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const scheduleNextRef = useRef<(isFirst?: boolean) => void>(() => undefined);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }

    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    shownItemKeysRef.current = readStringSet(SHOWN_ITEM_KEYS_KEY);
    shownNamesRef.current = readStringSet(SHOWN_NAMES_KEY);
    shownCountRef.current = readSessionCount(SHOWN_COUNT_KEY);
    dismissedCountRef.current = readSessionCount(DISMISSED_COUNT_KEY);
  }, []);

  useEffect(() => {
    itemsRef.current = [...toRealSocialProofItems(realSubscribers), ...legacySocialProofItems];
  }, [realSubscribers]);

  useEffect(() => {
    currentRef.current = currentItem;
  }, [currentItem]);

  useEffect(() => {
    enabledRef.current = enabled;

    if (!enabled) {
      stoppedRef.current = true;
      clearTimers();
      currentRef.current = null;
      setCurrentItem(null);
      return;
    }

    stoppedRef.current = false;
  }, [clearTimers, enabled]);

  scheduleNextRef.current = (isFirst = false) => {
    if (
      !enabledRef.current ||
      stoppedRef.current ||
      !fetchSettledRef.current ||
      shownCountRef.current >= MAX_NOTIFICATIONS_PER_SESSION ||
      dismissedCountRef.current >= MAX_DISMISSES_PER_SESSION ||
      showTimerRef.current !== null ||
      currentRef.current
    ) {
      return;
    }

    const availableItems = itemsRef.current.filter(
      (item) => !shownItemKeysRef.current.has(itemStorageKey(item)) && !shownNamesRef.current.has(normalizeName(item.displayName)),
    );
    if (availableItems.length === 0) {
      return;
    }

    const delay = isFirst ? randomMs(5000, 10000) : 5000;
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;

      if (!enabledRef.current || stoppedRef.current) {
        return;
      }

      const nextOptions = itemsRef.current.filter(
        (item) => !shownItemKeysRef.current.has(itemStorageKey(item)) && !shownNamesRef.current.has(normalizeName(item.displayName)),
      );
      if (nextOptions.length === 0) {
        return;
      }

      const nextItem = chooseNextItem(nextOptions);
      shownItemKeysRef.current.add(itemStorageKey(nextItem));
      shownNamesRef.current.add(normalizeName(nextItem.displayName));
      shownCountRef.current += 1;
      writeStringSet(SHOWN_ITEM_KEYS_KEY, shownItemKeysRef.current);
      writeStringSet(SHOWN_NAMES_KEY, shownNamesRef.current);
      writeSessionCount(SHOWN_COUNT_KEY, shownCountRef.current);
      currentRef.current = nextItem;
      setCurrentItem(nextItem);

      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        currentRef.current = null;
        setCurrentItem(null);
        scheduleNextRef.current(false);
      }, randomMs(4000, 5000));
    }, delay);
  };

  useEffect(() => {
    let isMounted = true;

    if (!enabled || fetchedRef.current) {
      return () => {
        isMounted = false;
      };
    }

    fetchedRef.current = true;
    fetchRecentPremiumSubscribers()
      .catch(() => [])
      .then((nextSubscribers) => {
        if (!isMounted) {
          fetchedRef.current = false;
          return;
        }

        itemsRef.current = [...toRealSocialProofItems(nextSubscribers), ...legacySocialProofItems];
        fetchSettledRef.current = true;
        setRealSubscribers(nextSubscribers);
        scheduleNextRef.current(true);
      });

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return clearTimers;
    }

    scheduleNextRef.current(true);
    return clearTimers;
  }, [clearTimers, enabled]);

  const dismissCurrentItem = useCallback(() => {
    if (!currentRef.current) {
      return;
    }

    clearTimers();
    currentRef.current = null;
    setCurrentItem(null);
    dismissedCountRef.current += 1;
    writeSessionCount(DISMISSED_COUNT_KEY, dismissedCountRef.current);

    if (dismissedCountRef.current >= MAX_DISMISSES_PER_SESSION) {
      stoppedRef.current = true;
      return;
    }

    scheduleNextRef.current(false);
  }, [clearTimers]);

  return {
    currentItem,
    dismissCurrentItem,
  };
}
