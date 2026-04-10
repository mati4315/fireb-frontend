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
import { useModuleStore, type FeedTabKey, type HomeTabKey } from './moduleStore';

type FeedTab = HomeTabKey;

const PAGE_SIZE = 10;

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

    if (tab !== 'todo' && tab !== 'surveys' && tab !== 'lottery') {
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
    if (currentTab.value === 'surveys' || currentTab.value === 'lottery') {
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
    hasMore.value = safeTab !== 'surveys' && safeTab !== 'lottery';

    if (safeTab === 'surveys' || safeTab === 'lottery') {
      loading.value = false;
      return;
    }

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
    if (currentTab.value === 'surveys' || currentTab.value === 'lottery') return;
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
    if (currentTab.value === 'surveys' || currentTab.value === 'lottery') return;
    adsStore.trackAdImpression(
      item,
      currentTab.value as FeedTabKey,
      moduleStore.modules.ads
    );
  };

  const trackAdClick = (item: AdFeedItem) => {
    if (currentTab.value === 'surveys' || currentTab.value === 'lottery') return;
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
    moduleName: 'news' | 'community' | 'likes' | 'comments' | 'surveys' | 'lottery' | 'ads'
  ) =>
    moduleStore.isModuleEnabled(moduleName);

  const isLikesEnabledForModule = (moduleName: 'news' | 'community') =>
    moduleStore.isLikesEnabledForModule(moduleName);

  const isCommentsEnabledForModule = (moduleName: 'news' | 'community') =>
    moduleStore.isCommentsEnabledForModule(moduleName);

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
