import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  where,
  type QueryConstraint,
  type Unsubscribe
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from './authStore';
import { useAdsStore, type AdFeedItem } from './adsStore';
import { useModuleStore, type FeedTabKey } from './moduleStore';

type FeedTab = 'todo' | 'news' | 'post';

const PAGE_SIZE = 20;

export const useFeedStore = defineStore('feed', () => {
  const authStore = useAuthStore();
  const moduleStore = useModuleStore();
  const adsStore = useAdsStore();

  const contentItems = ref<any[]>([]);
  const allItems = ref<any[]>([]);
  const currentTab = ref<FeedTab>('todo');
  const loading = ref(false);
  const hasMore = ref(true);
  const unsubscribe = ref<Unsubscribe | null>(null);

  const tabConfig: Record<Exclude<FeedTab, 'todo'>, { module: string }> = {
    news: { module: 'news' },
    post: { module: 'community' }
  };

  const availableTabs = computed(() => moduleStore.availableTabs);

  const resolveTab = (requestedTab: string): FeedTab => {
    const enabledKeys = availableTabs.value.map((tab) => tab.key);
    if (enabledKeys.includes(requestedTab as FeedTabKey)) {
      return requestedTab as FeedTab;
    }
    return (enabledKeys[0] || 'todo') as FeedTab;
  };

  const getTabConstraints = (tab: FeedTab): QueryConstraint[] => {
    const constraints: QueryConstraint[] = [where('deletedAt', '==', null)];

    if (tab !== 'todo') {
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
    const filteredContent = contentItems.value.filter(shouldKeepContentItem);
    const tab = currentTab.value as FeedTabKey;

    allItems.value = adsStore.mergeAdsIntoFeed(
      filteredContent,
      tab,
      moduleStore.modules.ads
    );
  };

  const initFeed = (tabName: string = 'todo') => {
    moduleStore.initModulesListener();
    adsStore.initAdsListener(moduleStore.modules.ads);

    const safeTab = resolveTab(tabName);

    if (currentTab.value === safeTab && unsubscribe.value) {
      rebuildMergedFeed();
      return;
    }

    if (unsubscribe.value) {
      unsubscribe.value();
      unsubscribe.value = null;
    }

    currentTab.value = safeTab;
    contentItems.value = [];
    allItems.value = [];
    loading.value = true;
    hasMore.value = true;

    const q = query(
      collection(db, 'content'),
      ...getTabConstraints(safeTab),
      limit(PAGE_SIZE)
    );

    unsubscribe.value = onSnapshot(
      q,
      (snapshot) => {
        contentItems.value = snapshot.docs.map((contentDoc) => ({
          id: contentDoc.id,
          ...contentDoc.data()
        }));
        hasMore.value = snapshot.size >= PAGE_SIZE;
        rebuildMergedFeed();
        loading.value = false;
      },
      (error) => {
        console.error('Error initializing feed:', error);
        loading.value = false;
      }
    );
  };

  const loadMore = async () => {
    if (!hasMore.value || loading.value || contentItems.value.length === 0) return;

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
        ...getTabConstraints(currentTab.value),
        startAfter(cursor),
        limit(PAGE_SIZE)
      );

      const snapshot = await getDocs(q);
      const newItems = snapshot.docs.map((contentDoc) => ({
        id: contentDoc.id,
        ...contentDoc.data()
      }));

      const dedupedItems = newItems.filter(
        (newItem) =>
          !contentItems.value.some((existingItem) => existingItem.id === newItem.id)
      );

      contentItems.value.push(...dedupedItems);
      hasMore.value = snapshot.size >= PAGE_SIZE;
      rebuildMergedFeed();
    } catch (error) {
      console.error('Error loading more feed items:', error);
    } finally {
      loading.value = false;
    }
  };

  const createPost = async (
    titulo: string,
    descripcion: string,
    images: string[] = []
  ) => {
    if (!moduleStore.modules.community.enabled) {
      throw new Error('El modulo comunidad esta deshabilitado');
    }

    if (!authStore.user || !authStore.userProfile) {
      throw new Error('No autenticado');
    }

    const newPost = {
      type: 'post',
      source: 'user',
      module: 'community',
      isOficial: false,
      titulo,
      descripcion,
      images: images || [],
      userId: authStore.user.uid,
      userName: authStore.userProfile.nombre,
      userProfilePicUrl: authStore.userProfile.profilePictureUrl,
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

  const trackAdImpression = (item: AdFeedItem) => {
    adsStore.trackAdImpression(
      item,
      currentTab.value as FeedTabKey,
      moduleStore.modules.ads
    );
  };

  const trackAdClick = (item: AdFeedItem) => {
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

  const isModuleEnabled = (moduleName: 'news' | 'community' | 'ads') =>
    moduleStore.isModuleEnabled(moduleName);

  const cleanup = () => {
    if (unsubscribe.value) {
      unsubscribe.value();
      unsubscribe.value = null;
    }
    adsStore.cleanup();
    moduleStore.cleanup();
  };

  return {
    allItems,
    currentTab,
    loading,
    hasMore,
    availableTabs,
    isModuleEnabled,
    initFeed,
    loadMore,
    createPost,
    trackAdImpression,
    trackAdClick,
    cleanup
  };
});
