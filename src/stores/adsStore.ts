import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from './authStore';
import type { AdsModuleConfig, FeedTabKey } from './moduleStore';

export type AdEventType = 'impression' | 'click';

export interface FeedAd {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  destinationUrl: string;
  ctaLabel: string;
  active: boolean;
  priority: number;
  startAt: any;
  endAt: any;
  updatedAt: any;
}

export interface AdFeedItem {
  id: string;
  type: 'ad';
  module: 'ads';
  isAd: true;
  ad: FeedAd;
  createdAt: any;
}

interface PendingAdEvent {
  adId: string;
  eventType: AdEventType;
  tab: FeedTabKey;
  count: number;
  sessionId: string;
}

const AD_COOLDOWN_STORAGE_KEY = 'cdeluar.ads.event.cooldowns';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const toMillis = (value: any): number | null => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const hashToUnit = (input: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0) / 4294967295;
};

const getSessionId = (): string => {
  const key = 'cdeluar.ads.session.id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const newId = `ads_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, newId);
  return newId;
};

const loadCooldowns = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(AD_COOLDOWN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveCooldowns = (value: Record<string, number>) => {
  try {
    localStorage.setItem(AD_COOLDOWN_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore localStorage quota issues.
  }
};

const normalizeAd = (id: string, data: any): FeedAd => {
  return {
    id,
    title: data.title || data.titulo || 'Publicidad',
    description: data.description || data.descripcion || '',
    imageUrl: data.imageUrl || data.image_url || '',
    destinationUrl:
      data.destinationUrl || data.enlaceDestino || data.enlace_destino || '',
    ctaLabel: data.ctaLabel || data.cta_label || 'Ver mas',
    active: Boolean(data.active ?? data.activo ?? false),
    priority: clamp(Number(data.priority ?? data.prioridad ?? 5), 1, 10),
    startAt: data.startAt ?? null,
    endAt: data.endAt ?? null,
    updatedAt: data.updatedAt ?? null
  };
};

export const useAdsStore = defineStore('ads', () => {
  const authStore = useAuthStore();

  const ads = ref<FeedAd[]>([]);
  const loading = ref(false);
  const unsubscribe = ref<Unsubscribe | null>(null);

  const pendingEvents = new Map<string, PendingAdEvent>();
  const cooldowns = loadCooldowns();
  const sessionId = getSessionId();
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  const isAdWithinSchedule = (ad: FeedAd): boolean => {
    const now = Date.now();
    const start = toMillis(ad.startAt);
    const end = toMillis(ad.endAt);
    const alreadyStarted = start == null || start <= now;
    const notExpired = end == null || end >= now;
    return alreadyStarted && notExpired;
  };

  const cleanupListener = () => {
    if (unsubscribe.value) {
      unsubscribe.value();
      unsubscribe.value = null;
    }
  };

  const initAdsListener = (config: AdsModuleConfig) => {
    cleanupListener();
    ads.value = [];

    if (!config.enabled) return;

    loading.value = true;
    const q = query(
      collection(db, 'ads'),
      where('active', '==', true),
      orderBy('priority', 'desc'),
      orderBy('updatedAt', 'desc'),
      limit(config.fetchLimit)
    );

    unsubscribe.value = onSnapshot(
      q,
      (snapshot) => {
        const nextAds = snapshot.docs
          .map((adDoc) => normalizeAd(adDoc.id, adDoc.data()))
          .filter((ad) => ad.active)
          .filter((ad) => isAdWithinSchedule(ad));

        ads.value = nextAds;
        loading.value = false;
      },
      (error) => {
        console.error('Error loading ads:', error);
        ads.value = [];
        loading.value = false;
      }
    );
  };

  const buildAdFeedItem = (ad: FeedAd, slotIndex: number, anchorId: string): AdFeedItem => {
    return {
      id: `ad_${ad.id}_${slotIndex}_${anchorId}`,
      type: 'ad',
      module: 'ads',
      isAd: true,
      ad,
      createdAt: ad.updatedAt || new Date().toISOString()
    };
  };

  const isTabAllowed = (tab: FeedTabKey, config: AdsModuleConfig): boolean => {
    return config.tabs.includes(tab);
  };

  const mergeAdsIntoFeed = (
    contentItems: any[],
    tab: FeedTabKey,
    config: AdsModuleConfig
  ): any[] => {
    if (!config.enabled || ads.value.length === 0 || !isTabAllowed(tab, config)) {
      return contentItems;
    }

    const maxAds = clamp(
      Math.min(config.maxAdsPerFeed, ads.value.length),
      0,
      config.maxAdsPerFeed
    );
    if (maxAds === 0) return contentItems;

    const minGap = Math.max(1, config.minPostsBetweenAds);
    const safeProbability = clamp(config.probability, 0, 1);
    const daySeed = new Date().toISOString().slice(0, 10);
    const baseSeed = `${daySeed}:${tab}:${contentItems.length}`;

    const merged: any[] = [];
    let postsSinceLastAd = 0;
    let insertedAds = 0;

    for (const item of contentItems) {
      merged.push(item);
      postsSinceLastAd += 1;

      if (insertedAds >= maxAds) continue;
      if (postsSinceLastAd < minGap) continue;

      const insertScore = hashToUnit(`${baseSeed}:insert:${item.id}:${insertedAds}`);
      if (insertScore > safeProbability) continue;

      const adIndex = Math.floor(
        hashToUnit(`${baseSeed}:ad:${item.id}:${insertedAds}`) * ads.value.length
      );
      const selectedAd = ads.value[adIndex % ads.value.length];

      merged.push(buildAdFeedItem(selectedAd, insertedAds, item.id));
      postsSinceLastAd = 0;
      insertedAds += 1;
    }

    return merged;
  };

  const canTrackWithCooldown = (
    adId: string,
    eventType: AdEventType,
    cooldownMs: number
  ): boolean => {
    if (cooldownMs <= 0) return true;
    const now = Date.now();
    const key = `${eventType}:${adId}`;
    const lastAt = cooldowns[key] || 0;

    if (now - lastAt < cooldownMs) return false;

    cooldowns[key] = now;
    saveCooldowns(cooldowns);
    return true;
  };

  const ensureFlushTimer = () => {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
      void flushEvents();
    }, 5000);
  };

  const enqueueAdEvent = (
    adId: string,
    eventType: AdEventType,
    tab: FeedTabKey,
    count: number = 1
  ) => {
    const userId = authStore.user?.uid;
    if (!userId) return;

    const key = `${eventType}:${adId}:${tab}`;
    const current = pendingEvents.get(key);
    if (current) {
      current.count = clamp(current.count + count, 1, 10);
    } else {
      pendingEvents.set(key, {
        adId,
        eventType,
        tab,
        count: clamp(count, 1, 10),
        sessionId
      });
    }

    ensureFlushTimer();
  };

  const flushEvents = async () => {
    if (pendingEvents.size === 0) return;
    const userId = authStore.user?.uid;
    if (!userId) {
      pendingEvents.clear();
      return;
    }

    const payload = Array.from(pendingEvents.values());
    const batch = writeBatch(db);

    for (const event of payload) {
      const eventRef = doc(collection(db, 'ad_events'));
      batch.set(eventRef, {
        adId: event.adId,
        eventType: event.eventType,
        tab: event.tab,
        count: event.count,
        sessionId: event.sessionId,
        userId,
        clientAt: new Date().toISOString(),
        createdAt: serverTimestamp()
      });
    }

    try {
      await batch.commit();
      pendingEvents.clear();
    } catch (error) {
      console.error('Error flushing ad events:', error);
    }
  };

  const trackAdImpression = (
    adItem: AdFeedItem,
    tab: FeedTabKey,
    config: AdsModuleConfig
  ) => {
    if (!config.enabled || !config.trackImpressions) return;
    const adId = adItem.ad?.id;
    if (!adId) return;

    const allowed = canTrackWithCooldown(
      adId,
      'impression',
      config.impressionCooldownMs
    );
    if (!allowed) return;

    enqueueAdEvent(adId, 'impression', tab, 1);
  };

  const trackAdClick = (
    adItem: AdFeedItem,
    tab: FeedTabKey,
    config: AdsModuleConfig
  ) => {
    if (!config.enabled || !config.trackClicks) return;
    const adId = adItem.ad?.id;
    if (!adId) return;

    const allowed = canTrackWithCooldown(adId, 'click', config.clickCooldownMs);
    if (!allowed) return;

    enqueueAdEvent(adId, 'click', tab, 1);
  };

  const cleanup = () => {
    cleanupListener();

    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }

    void flushEvents();
  };

  return {
    ads,
    loading,
    initAdsListener,
    mergeAdsIntoFeed,
    trackAdImpression,
    trackAdClick,
    cleanup
  };
});
