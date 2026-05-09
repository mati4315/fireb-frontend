import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  where,
  type QueryConstraint
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from './authStore';
import { useAdsStore, type AdFeedItem } from './adsStore';
import { useModuleStore, type FeedTabKey, type HomeTabKey } from './moduleStore';

type FeedTab = HomeTabKey;

const PAGE_SIZE = 10;
const FEED_CACHE_TTL_MS = 2 * 60 * 1000;
const FEED_CACHE_PREFIX = 'cdeluar.feed.cache.v1';

export const useFeedStore = defineStore('feed', () => {
  const authStore = useAuthStore();
  const moduleStore = useModuleStore();
  const adsStore = useAdsStore();

  const contentItems = ref<any[]>([]);
  const allItems = ref<any[]>([]);
  const currentTab = ref<FeedTab>('todo');
  const loading = ref(false);
  const initialized = ref(false);
  const hasMore = ref(true);

  interface TabState {
    contentItems: any[];
    allItems: any[];
    hasMore: boolean;
    lastFetchedAt: number;
  }
  const tabStates = ref<Record<string, TabState>>({});

  const getTabState = (tab: string): TabState => {
    if (!tabStates.value[tab]) {
      tabStates.value[tab] = {
        contentItems: [],
        allItems: [],
        hasMore: true,
        lastFetchedAt: 0
      };
    }
    return tabStates.value[tab];
  };

  const buildCacheKey = (tab: FeedTab): string => `${FEED_CACHE_PREFIX}:${tab}`;

  const writePersistedTabState = (tab: FeedTab, state: TabState) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        buildCacheKey(tab),
        JSON.stringify({
          contentItems: state.contentItems,
          hasMore: state.hasMore,
          lastFetchedAt: state.lastFetchedAt
        })
      );
    } catch {
      // Ignore cache quota errors.
    }
  };

  const readPersistedTabState = (tab: FeedTab): TabState | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(buildCacheKey(tab));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;

      const content = Array.isArray(parsed.contentItems) ? parsed.contentItems : [];
      const hasMoreValue = parsed.hasMore !== false;
      const lastFetchedAtValue = Number(parsed.lastFetchedAt || 0);

      if (!Number.isFinite(lastFetchedAtValue) || Date.now() - lastFetchedAtValue > FEED_CACHE_TTL_MS) {
        return null;
      }

      return {
        contentItems: content,
        allItems: [],
        hasMore: hasMoreValue,
        lastFetchedAt: lastFetchedAtValue
      };
    } catch {
      return null;
    }
  };

  const tabConfig: Record<'news' | 'post', { module: string }> = {
    news: { module: 'news' },
    post: { module: 'community' }
  };

  const availableTabs = computed(() => moduleStore.availableTabs);

  const resolveTab = (requestedTab: string): FeedTab => {
    const enabledKeys = availableTabs.value.map((tab) => tab.key);
    if (enabledKeys.includes(requestedTab as HomeTabKey)) {
      return requestedTab as FeedTab;
    }
    return (enabledKeys[0] || 'todo') as FeedTab;
  };

  const getTabConstraints = (tab: FeedTab): QueryConstraint[] => {
    const constraints: QueryConstraint[] = [where('deletedAt', '==', null)];

    if (tab !== 'todo' && tab !== 'secrets' && tab !== 'surveys' && tab !== 'lottery') {
      const cfg = tabConfig[tab];
      constraints.push(where('module', '==', cfg.module));
    }

    constraints.push(orderBy('createdAt', 'desc'));
    return constraints;
  };

  const shouldKeepContentItem = (item: any): boolean => {
    if (item.module === 'news' && !moduleStore.modules.news.enabled) return false;
    if (item.module === 'community' && !moduleStore.modules.community.enabled) return false;
    return true;
  };

  const rebuildMergedFeed = () => {
    if (
      currentTab.value === 'secrets' ||
      currentTab.value === 'surveys' ||
      currentTab.value === 'lottery'
    ) {
      allItems.value = [];
      return;
    }

    const filteredContent = contentItems.value.filter(shouldKeepContentItem);
    const tab = currentTab.value as FeedTabKey;

    allItems.value = adsStore.mergeAdsIntoFeed(
      filteredContent,
      tab,
      moduleStore.modules.ads
    );

    const state = getTabState(currentTab.value);
    state.allItems = [...allItems.value];
    state.contentItems = [...contentItems.value];
    writePersistedTabState(currentTab.value, state);
  };

  const fetchFirstPage = async (targetTab: FeedTab) => {
    if (targetTab === 'secrets' || targetTab === 'surveys' || targetTab === 'lottery') {
      const state = getTabState(targetTab);
      state.contentItems = [];
      state.allItems = [];
      state.hasMore = false;
      state.lastFetchedAt = Date.now();
      if (currentTab.value === targetTab) {
        contentItems.value = [];
        allItems.value = [];
        hasMore.value = false;
        loading.value = false;
      }
      return;
    }

    const q = query(
      collection(db, 'content'),
      ...getTabConstraints(targetTab),
      limit(PAGE_SIZE)
    );

    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((contentDoc) => ({
      id: contentDoc.id,
      ...contentDoc.data({ serverTimestamps: 'estimate' })
    }));

    const state = getTabState(targetTab);
    state.contentItems = items;
    state.hasMore = snapshot.size >= PAGE_SIZE;
    state.lastFetchedAt = Date.now();

    if (currentTab.value === targetTab) {
      contentItems.value = [...items];
      hasMore.value = state.hasMore;
      rebuildMergedFeed();
      loading.value = false;
    }
  };

  const initFeed = async (tabName: string = 'todo') => {
    await moduleStore.initModules();
    await adsStore.initAds(moduleStore.modules.ads);

    const safeTab = resolveTab(tabName);

    currentTab.value = safeTab;

    const persisted = readPersistedTabState(safeTab);
    if (persisted) {
      const state = getTabState(safeTab);
      state.contentItems = [...persisted.contentItems];
      state.hasMore = persisted.hasMore;
      state.lastFetchedAt = persisted.lastFetchedAt;
      contentItems.value = [...state.contentItems];
      hasMore.value = state.hasMore;
      rebuildMergedFeed();
      loading.value = false;
      initialized.value = true;

      void fetchFirstPage(safeTab).catch((error) => {
        console.error('Error refreshing cached feed:', error);
      });
      return;
    }

    const cached = getTabState(safeTab);
    if (cached.contentItems.length > 0) {
      contentItems.value = [...cached.contentItems];
      hasMore.value = cached.hasMore;
      rebuildMergedFeed();
      loading.value = false;
      initialized.value = true;

      if (Date.now() - cached.lastFetchedAt > FEED_CACHE_TTL_MS) {
        void fetchFirstPage(safeTab).catch((error) => {
          console.error('Error refreshing stale feed cache:', error);
        });
      }
      return;
    }

    contentItems.value = [];
    allItems.value = [];
    loading.value = true;
    hasMore.value = safeTab !== 'secrets' && safeTab !== 'surveys' && safeTab !== 'lottery';

    try {
      await fetchFirstPage(safeTab);
    } catch (error) {
      console.error('Error initializing feed:', error);
      if (currentTab.value === safeTab) {
        loading.value = false;
      }
    } finally {
      initialized.value = true;
    }
  };

  const loadMore = async () => {
    if (
      currentTab.value === 'secrets' ||
      currentTab.value === 'surveys' ||
      currentTab.value === 'lottery'
    ) {
      return;
    }
    if (!hasMore.value || loading.value || contentItems.value.length === 0) return;

    const tabAtStart = currentTab.value;
    const lastContentItem = contentItems.value[contentItems.value.length - 1];
    const cursor = lastContentItem?.createdAt || lastContentItem?.updatedAt;
    
    if (!cursor) {
      hasMore.value = false;
      return;
    }

    loading.value = true;
    try {
      const q = query(
        collection(db, 'content'),
        ...getTabConstraints(tabAtStart),
        startAfter(cursor),
        limit(PAGE_SIZE)
      );

      const snapshot = await getDocs(q);
      const newItems = snapshot.docs.map((contentDoc) => ({
        id: contentDoc.id,
        ...contentDoc.data({ serverTimestamps: 'estimate' })
      }));

      // If tab changed while loading, update the target tab state
      const state = getTabState(tabAtStart);
      
      const dedupedItems = newItems.filter(
        (newItem) => !state.contentItems.some((existingItem) => existingItem.id === newItem.id)
      );

      state.contentItems.push(...dedupedItems);
      state.hasMore = snapshot.size >= PAGE_SIZE;
      state.lastFetchedAt = Date.now();

      if (currentTab.value === tabAtStart) {
        contentItems.value = [...state.contentItems];
        hasMore.value = state.hasMore;
        rebuildMergedFeed();
      }
    } catch (error) {
      console.error('Error loading more feed items:', error);
    } finally {
      if (currentTab.value === tabAtStart) {
        loading.value = false;
      }
    }
  };

  const createPost = async (
    titulo: string,
    descripcion: string,
    images: string[] = [],
    imagesV2: Array<{
      url: string;
      thumbUrl: string;
      path: string;
      thumbPath: string;
      width: number;
      height: number;
      sizeBytes: number;
    }> = []
  ) => {
    if (!moduleStore.modules.community.enabled) {
      throw new Error('El modulo comunidad esta deshabilitado');
    }

    if (!authStore.user) {
      throw new Error('No autenticado');
    }

    const fallbackName =
      authStore.user.displayName ||
      authStore.user.email?.split('@')[0] ||
      'Usuario';
    const safeUserName =
      authStore.userProfile?.nombre?.trim() || fallbackName.trim();
    const safeProfilePic =
      authStore.userProfile?.profilePictureUrl || authStore.user.photoURL || '';

    const newPost = {
      type: 'post',
      source: 'user',
      module: 'community',
      isOficial: false,
      titulo,
      descripcion,
      images: images || [],
      imagesV2: imagesV2 || [],
      userId: authStore.user.uid,
      userName: safeUserName,
      userUsername: authStore.userProfile?.username || '',
      userProfilePicUrl: safeProfilePic,
      stats: {
        likesCount: 0,
        commentsCount: 0,
        viewsCount: 0
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletedAt: null
    };

    const docRef = await addDoc(collection(db, 'content'), newPost);
    return { id: docRef.id, ...newPost };
  };

  const deletePost = async (postId: string) => {
    if (!authStore.user) {
      throw new Error('No autenticado');
    }
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'content', postId), {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Remove locally
    contentItems.value = contentItems.value.filter(item => item.id !== postId);
    rebuildMergedFeed();
  };

  const editPost = async (postId: string, title: string, content: string, imagesV2?: any[], images?: string[]) => {
    if (!authStore.user) {
      throw new Error('No autenticado');
    }
    const { doc, updateDoc } = await import('firebase/firestore');
    
    const updateData: any = {
      titulo: title,
      descripcion: content,
      updatedAt: serverTimestamp()
    };
    
    if (imagesV2 !== undefined) {
      updateData.imagesV2 = imagesV2;
      updateData.images = images || [];
    }
    
    await updateDoc(doc(db, 'content', postId), updateData);

    // Update locally
    const existing = contentItems.value.find(item => item.id === postId);
    if (existing) {
      existing.titulo = title;
      existing.descripcion = content;
      if (imagesV2 !== undefined) {
        existing.imagesV2 = imagesV2;
        existing.images = images || [];
      }
      existing.updatedAt = new Date().toISOString(); // local approximation
      rebuildMergedFeed();
    }
  };

  const trackAdImpression = (item: AdFeedItem) => {
    if (
      currentTab.value === 'secrets' ||
      currentTab.value === 'surveys' ||
      currentTab.value === 'lottery'
    ) {
      return;
    }
    adsStore.trackAdImpression(
      item,
      currentTab.value as FeedTabKey,
      moduleStore.modules.ads
    );
  };

  const trackAdClick = (item: AdFeedItem) => {
    if (
      currentTab.value === 'secrets' ||
      currentTab.value === 'surveys' ||
      currentTab.value === 'lottery'
    ) {
      return;
    }
    adsStore.trackAdClick(
      item,
      currentTab.value as FeedTabKey,
      moduleStore.modules.ads
    );
  };

  watch(
    () => moduleStore.modules,
    (modules) => {
      const safeTab = resolveTab(currentTab.value);
      if (safeTab !== currentTab.value) {
        initFeed(safeTab);
        return;
      }

      adsStore.initAdsListener(modules.ads);
      rebuildMergedFeed();
    },
    { deep: true }
  );

  watch(
    () => adsStore.ads,
    () => {
      rebuildMergedFeed();
    },
    { deep: true }
  );

  const isModuleEnabled = (
    moduleName: 'news' | 'community' | 'secrets' | 'likes' | 'comments' | 'surveys' | 'lottery' | 'ads'
  ) =>
    moduleStore.isModuleEnabled(moduleName);

  const isLikesEnabledForModule = (moduleName: 'news' | 'community') =>
    moduleStore.isLikesEnabledForModule(moduleName);

  const isCommentsEnabledForModule = (moduleName: 'news' | 'community') =>
    moduleStore.isCommentsEnabledForModule(moduleName);

  const cleanup = () => {
    adsStore.cleanup();
    moduleStore.cleanup();
  };

  return {
    allItems,
    currentTab,
    loading,
    initialized,
    hasMore,
    availableTabs,
    isModuleEnabled,
    isLikesEnabledForModule,
    isCommentsEnabledForModule,
    initFeed,
    loadMore,
    createPost,
    deletePost,
    editPost,
    trackAdImpression,
    trackAdClick,
    cleanup
  };
});
