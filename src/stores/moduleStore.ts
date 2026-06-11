import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

export type FeedTabKey = 'todo' | 'news' | 'post';
export type HomeTabKey = FeedTabKey | 'secrets' | 'surveys' | 'lottery';

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

export interface RadioModuleConfig {
  enabled: boolean;
  active: boolean;
  title: string;
  description: string;
  audioUrl: string;
  liveUrl: string;
  ctaLabel: string;
}

export interface ModulesConfig {
  news: { enabled: boolean };
  community: { enabled: boolean };
  secrets: { enabled: boolean };
  notifications: { enabled: boolean };
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
  radio: RadioModuleConfig;
}

const DEFAULT_MODULES_CONFIG: ModulesConfig = {
  news: { enabled: true },
  community: { enabled: true },
  secrets: { enabled: true },
  notifications: { enabled: true },
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
  },
  radio: {
    enabled: true,
    active: false,
    title: 'Radio en vivo',
    description: 'Escucha la transmision en directo.',
    audioUrl: '',
    liveUrl: '',
    ctaLabel: 'Ir al link'
  }
};
const MODULES_CACHE_KEY = 'cdeluar.modules.config.cache.v2';
const MODULES_CACHE_TTL_MS = 10 * 60 * 1000;

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

const sanitizeRadioConfig = (raw: any): RadioModuleConfig => {
  const rawRadio = raw?.radio ?? {};

  return {
    enabled: toBoolean(rawRadio.enabled, DEFAULT_MODULES_CONFIG.radio.enabled),
    active: toBoolean(rawRadio.active, DEFAULT_MODULES_CONFIG.radio.active),
    title: typeof rawRadio.title === 'string' && rawRadio.title.trim()
      ? rawRadio.title.trim()
      : DEFAULT_MODULES_CONFIG.radio.title,
    description: typeof rawRadio.description === 'string'
      ? rawRadio.description.trim()
      : DEFAULT_MODULES_CONFIG.radio.description,
    audioUrl: typeof rawRadio.audioUrl === 'string' ? rawRadio.audioUrl.trim() : '',
    liveUrl: typeof rawRadio.liveUrl === 'string' ? rawRadio.liveUrl.trim() : '',
    ctaLabel: typeof rawRadio.ctaLabel === 'string' && rawRadio.ctaLabel.trim()
      ? rawRadio.ctaLabel.trim()
      : DEFAULT_MODULES_CONFIG.radio.ctaLabel
  };
};

const sanitizeModulesConfig = (raw: any): ModulesConfig => {
  const rawNews = raw?.news ?? {};
  const rawCommunity = raw?.community ?? {};
  const rawSecrets = raw?.secrets ?? {};
  const rawNotifications = raw?.notifications ?? {};
  const rawLikes = raw?.likes ?? {};
  const rawComments = raw?.comments ?? {};
  const rawSurveys = raw?.surveys ?? {};
  const rawLottery = raw?.lottery ?? {};
  const rawAds = raw?.ads ?? {};
  const radio = sanitizeRadioConfig(raw);

  return {
    news: {
      enabled: toBoolean(rawNews.enabled, DEFAULT_MODULES_CONFIG.news.enabled)
    },
    community: {
      enabled: toBoolean(rawCommunity.enabled, DEFAULT_MODULES_CONFIG.community.enabled)
    },
    secrets: {
      enabled: toBoolean(rawSecrets.enabled, DEFAULT_MODULES_CONFIG.secrets.enabled)
    },
    notifications: {
      enabled: toBoolean(rawNotifications.enabled, DEFAULT_MODULES_CONFIG.notifications.enabled)
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
    },
    radio
  };
};

export const useModuleStore = defineStore('module', () => {
  const modules = ref<ModulesConfig>(DEFAULT_MODULES_CONFIG);
  const loading = ref(false);
  const initialized = ref(false);

  const loadModulesFromCache = () => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(MODULES_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return false;
      const updatedAt = Number(parsed.updatedAt || 0);
      if (!Number.isFinite(updatedAt)) return false;
      if (Date.now() - updatedAt > MODULES_CACHE_TTL_MS) return false;
      modules.value = sanitizeModulesConfig(parsed.data || {});
      return true;
    } catch {
      return false;
    }
  };

  const saveModulesToCache = () => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        MODULES_CACHE_KEY,
        JSON.stringify({
          updatedAt: Date.now(),
          data: modules.value
        })
      );
    } catch {
      // Ignore cache quota errors.
    }
  };

  const isModuleEnabled = (moduleName: keyof ModulesConfig): boolean => {
    if (moduleName === 'news') return modules.value.news.enabled;
    if (moduleName === 'community') return modules.value.community.enabled;
    if (moduleName === 'secrets') return modules.value.secrets.enabled;
    if (moduleName === 'notifications') return modules.value.notifications.enabled;
    if (moduleName === 'likes') return modules.value.likes.enabled;
    if (moduleName === 'comments') return modules.value.comments.enabled;
    if (moduleName === 'surveys') return modules.value.surveys.enabled;
    if (moduleName === 'lottery') return modules.value.lottery.enabled;
    if (moduleName === 'radio') return modules.value.radio.enabled;
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
    if (modules.value.secrets.enabled) {
      tabs.push({ key: 'secrets', label: 'Secretos' });
    }

    return tabs;
  });

  const fetchModules = async () => {
    const configRef = doc(db, '_config', 'modules');
    const snapshot = await getDoc(configRef);
    if (snapshot.exists()) {
      modules.value = sanitizeModulesConfig(snapshot.data());
    } else {
      modules.value = DEFAULT_MODULES_CONFIG;
    }
    saveModulesToCache();
  };

  const initModules = async (forceRefresh = false) => {
    if (loading.value) return;
    if (initialized.value && !forceRefresh) return;

    loading.value = true;
    try {
      const cacheLoaded = !forceRefresh ? loadModulesFromCache() : false;
      if (cacheLoaded) {
        initialized.value = true;
        loading.value = false;
        void fetchModules()
          .then(() => {
            initialized.value = true;
          })
          .catch((error) => {
            console.error('Error refreshing module config:', error);
          });
        return;
      }

      await fetchModules();
      initialized.value = true;
    } catch (error) {
      console.error('Error loading module config:', error);
      if (!loadModulesFromCache()) {
        modules.value = DEFAULT_MODULES_CONFIG;
      }
    } finally {
      loading.value = false;
    }
  };

  const initModulesListener = () => {
    void initModules(false);
  };

  const cleanup = () => {
    initialized.value = false;
  };

  return {
    modules,
    loading,
    availableTabs,
    isModuleEnabled,
    isLikesEnabledForModule,
    isCommentsEnabledForModule,
    initModules,
    initModulesListener,
    cleanup
  };
});
