import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/config/firebase';

export type FeedTabKey = 'todo' | 'news' | 'post';
export type HomeTabKey = FeedTabKey | 'surveys' | 'lottery';

export interface AdsModuleConfig {
  enabled: boolean;
  maxAdsPerFeed: number;
  minPostsBetweenAds: number;
  probability: number;
  fetchLimit: number;
  trackImpressions: boolean;
  trackClicks: boolean;
  tabs: FeedTabKey[];
  impressionCooldownMs: number;
  clickCooldownMs: number;
}

export interface ModulesConfig {
  news: { enabled: boolean };
  community: { enabled: boolean };
  likes: {
    enabled: boolean;
    newsEnabled: boolean;
    communityEnabled: boolean;
  };
  comments: {
    enabled: boolean;
    newsEnabled: boolean;
    communityEnabled: boolean;
  };
  surveys: { enabled: boolean };
  lottery: { enabled: boolean };
  ads: AdsModuleConfig;
}

const DEFAULT_MODULES_CONFIG: ModulesConfig = {
  news: { enabled: true },
  community: { enabled: true },
  likes: {
    enabled: true,
    newsEnabled: true,
    communityEnabled: true
  },
  comments: {
    enabled: true,
    newsEnabled: true,
    communityEnabled: true
  },
  surveys: { enabled: true },
  lottery: { enabled: true },
  ads: {
    enabled: false,
    maxAdsPerFeed: 2,
    minPostsBetweenAds: 6,
    probability: 0.7,
    fetchLimit: 8,
    trackImpressions: true,
    trackClicks: true,
    tabs: ['todo'],
    impressionCooldownMs: 60 * 60 * 1000,
    clickCooldownMs: 0
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  return typeof value === 'boolean' ? value : fallback;
};

const sanitizeTabs = (value: unknown): FeedTabKey[] => {
  const validTabs: FeedTabKey[] = ['todo', 'news', 'post'];
  if (!Array.isArray(value)) return ['todo'];

  const tabs = value.filter((tab): tab is FeedTabKey => validTabs.includes(tab as FeedTabKey));
  return tabs.length > 0 ? tabs : ['todo'];
};

const sanitizeModulesConfig = (raw: any): ModulesConfig => {
  const rawNews = raw?.news ?? {};
  const rawCommunity = raw?.community ?? {};
  const rawLikes = raw?.likes ?? {};
  const rawComments = raw?.comments ?? {};
  const rawSurveys = raw?.surveys ?? {};
  const rawLottery = raw?.lottery ?? {};
  const rawAds = raw?.ads ?? {};

  return {
    news: {
      enabled: toBoolean(rawNews.enabled, DEFAULT_MODULES_CONFIG.news.enabled)
    },
    community: {
      enabled: toBoolean(rawCommunity.enabled, DEFAULT_MODULES_CONFIG.community.enabled)
    },
    likes: {
      enabled: toBoolean(rawLikes.enabled, DEFAULT_MODULES_CONFIG.likes.enabled),
      newsEnabled: toBoolean(rawLikes.newsEnabled, DEFAULT_MODULES_CONFIG.likes.newsEnabled),
      communityEnabled: toBoolean(
        rawLikes.communityEnabled,
        DEFAULT_MODULES_CONFIG.likes.communityEnabled
      )
    },
    comments: {
      enabled: toBoolean(rawComments.enabled, DEFAULT_MODULES_CONFIG.comments.enabled),
      newsEnabled: toBoolean(
        rawComments.newsEnabled,
        DEFAULT_MODULES_CONFIG.comments.newsEnabled
      ),
      communityEnabled: toBoolean(
        rawComments.communityEnabled,
        DEFAULT_MODULES_CONFIG.comments.communityEnabled
      )
    },
    surveys: {
      enabled: toBoolean(rawSurveys.enabled, DEFAULT_MODULES_CONFIG.surveys.enabled)
    },
    lottery: {
      enabled: toBoolean(rawLottery.enabled, DEFAULT_MODULES_CONFIG.lottery.enabled)
    },
    ads: {
      enabled: toBoolean(rawAds.enabled, DEFAULT_MODULES_CONFIG.ads.enabled),
      maxAdsPerFeed: clamp(
        Math.floor(toNumber(rawAds.maxAdsPerFeed, DEFAULT_MODULES_CONFIG.ads.maxAdsPerFeed)),
        0,
        6
      ),
      minPostsBetweenAds: clamp(
        Math.floor(
          toNumber(rawAds.minPostsBetweenAds, DEFAULT_MODULES_CONFIG.ads.minPostsBetweenAds)
        ),
        1,
        20
      ),
      probability: clamp(
        toNumber(rawAds.probability, DEFAULT_MODULES_CONFIG.ads.probability),
        0,
        1
      ),
      fetchLimit: clamp(
        Math.floor(toNumber(rawAds.fetchLimit, DEFAULT_MODULES_CONFIG.ads.fetchLimit)),
        1,
        20
      ),
      trackImpressions: toBoolean(
        rawAds.trackImpressions,
        DEFAULT_MODULES_CONFIG.ads.trackImpressions
      ),
      trackClicks: toBoolean(rawAds.trackClicks, DEFAULT_MODULES_CONFIG.ads.trackClicks),
      tabs: sanitizeTabs(rawAds.tabs),
      impressionCooldownMs: clamp(
        Math.floor(
          toNumber(rawAds.impressionCooldownMs, DEFAULT_MODULES_CONFIG.ads.impressionCooldownMs)
        ),
        0,
        24 * 60 * 60 * 1000
      ),
      clickCooldownMs: clamp(
        Math.floor(toNumber(rawAds.clickCooldownMs, DEFAULT_MODULES_CONFIG.ads.clickCooldownMs)),
        0,
        24 * 60 * 60 * 1000
      )
    }
  };
};

export const useModuleStore = defineStore('module', () => {
  const modules = ref<ModulesConfig>(DEFAULT_MODULES_CONFIG);
  const loading = ref(false);
  const unsubscribe = ref<Unsubscribe | null>(null);

  const isModuleEnabled = (moduleName: keyof ModulesConfig): boolean => {
    if (moduleName === 'news') return modules.value.news.enabled;
    if (moduleName === 'community') return modules.value.community.enabled;
    if (moduleName === 'likes') return modules.value.likes.enabled;
    if (moduleName === 'comments') return modules.value.comments.enabled;
    if (moduleName === 'surveys') return modules.value.surveys.enabled;
    if (moduleName === 'lottery') return modules.value.lottery.enabled;
    return modules.value.ads.enabled;
  };

  const isLikesEnabledForModule = (moduleName: 'news' | 'community'): boolean => {
    if (!modules.value.likes.enabled) return false;
    if (moduleName === 'news') return modules.value.likes.newsEnabled;
    return modules.value.likes.communityEnabled;
  };

  const isCommentsEnabledForModule = (moduleName: 'news' | 'community'): boolean => {
    if (!modules.value.comments.enabled) return false;
    if (moduleName === 'news') return modules.value.comments.newsEnabled;
    return modules.value.comments.communityEnabled;
  };

  const availableTabs = computed(() => {
    const tabs: Array<{ key: HomeTabKey; label: string }> = [{ key: 'todo', label: 'Todos' }];

    if (modules.value.news.enabled) {
      tabs.push({ key: 'news', label: 'Noticias' });
    }
    if (modules.value.community.enabled) {
      tabs.push({ key: 'post', label: 'Comunidad' });
    }
    if (modules.value.surveys.enabled) {
      tabs.push({ key: 'surveys', label: 'Encuestas' });
    }
    if (modules.value.lottery.enabled) {
      tabs.push({ key: 'lottery', label: 'Loteria' });
    }

    return tabs;
  });

  const initModulesListener = () => {
    if (unsubscribe.value) return;

    loading.value = true;
    const configRef = doc(db, '_config', 'modules');

    unsubscribe.value = onSnapshot(
      configRef,
      (snapshot) => {
        if (snapshot.exists()) {
          modules.value = sanitizeModulesConfig(snapshot.data());
        } else {
          modules.value = DEFAULT_MODULES_CONFIG;
        }
        loading.value = false;
      },
      (error) => {
        console.error('Error loading module config:', error);
        modules.value = DEFAULT_MODULES_CONFIG;
        loading.value = false;
      }
    );
  };

  const cleanup = () => {
    if (unsubscribe.value) {
      unsubscribe.value();
      unsubscribe.value = null;
    }
  };

  return {
    modules,
    loading,
    availableTabs,
    isModuleEnabled,
    isLikesEnabledForModule,
    isCommentsEnabledForModule,
    initModulesListener,
    cleanup
  };
});
