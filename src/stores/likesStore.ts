import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions as firebaseFunctions } from '@/config/firebase';
import { useAuthStore } from './authStore';
import { useModuleStore } from './moduleStore';

const normalizeContentIds = (ids: string[]): string[] => {
  const normalized = new Set<string>();
  for (const rawId of ids) {
    if (typeof rawId !== 'string') continue;
    const contentId = rawId.trim();
    if (!contentId) continue;
    normalized.add(contentId);
  }
  return Array.from(normalized);
};

type ToggleLikeCallableResponse = {
  status: 'ok';
  liked: boolean;
  contentId: string;
};

export const useLikesStore = defineStore('likes', () => {
  const authStore = useAuthStore();
  const moduleStore = useModuleStore();

  const likedByContent = ref<Record<string, boolean>>({});
  const pendingByContent = ref<Record<string, boolean>>({});
  const errorByContent = ref<Record<string, string | null>>({});
  const authSessionVersion = ref(0);

  const setLikedLocal = (contentId: string, liked: boolean) => {
    likedByContent.value = {
      ...likedByContent.value,
      [contentId]: liked
    };
  };

  const setPendingLocal = (contentId: string, pending: boolean) => {
    pendingByContent.value = {
      ...pendingByContent.value,
      [contentId]: pending
    };
  };

  const setErrorLocal = (contentId: string, message: string | null) => {
    errorByContent.value = {
      ...errorByContent.value,
      [contentId]: message
    };
  };

  const isLiked = (contentId: string): boolean => Boolean(likedByContent.value[contentId]);

  const isLikePending = (contentId: string): boolean =>
    Boolean(pendingByContent.value[contentId]);

  const getLikeError = (contentId: string): string | null =>
    errorByContent.value[contentId] || null;

  const isLikesEnabledForModule = (moduleName: 'news' | 'community'): boolean =>
    moduleStore.isLikesEnabledForModule(moduleName);

  const primeLikesForContentIds = async (ids: string[]): Promise<void> => {
    const contentIds = normalizeContentIds(ids);
    if (contentIds.length === 0) return;
    const requestSessionVersion = authSessionVersion.value;
    const requestUserId = authStore.user?.uid || '';

    if (!requestUserId) {
      const likedPatch = { ...likedByContent.value };
      for (const contentId of contentIds) {
        likedPatch[contentId] = false;
      }
      if (requestSessionVersion !== authSessionVersion.value) return;
      likedByContent.value = likedPatch;
      return;
    }

    const userId = requestUserId;
    const toLoad = contentIds.filter(
      (contentId) => !pendingByContent.value[contentId]
    );

    if (toLoad.length === 0) return;

    const likedPatch = { ...likedByContent.value };
    const errorPatch = { ...errorByContent.value };

    await Promise.all(
      toLoad.map(async (contentId) => {
        try {
          const likeRef = doc(db, 'content', contentId, 'likes', userId);
          const likeSnap = await getDoc(likeRef);
          likedPatch[contentId] = likeSnap.exists();
          errorPatch[contentId] = null;
        } catch (error) {
          errorPatch[contentId] =
            error instanceof Error
              ? error.message
              : 'No se pudo sincronizar el estado de me gusta.';
        }
      })
    );

    if (
      requestSessionVersion !== authSessionVersion.value ||
      requestUserId !== (authStore.user?.uid || '')
    ) {
      return;
    }

    likedByContent.value = likedPatch;
    errorByContent.value = errorPatch;
  };

  const toggleLikeOptimistic = async (contentIdRaw: string): Promise<void> => {
    const contentId = contentIdRaw.trim();
    if (!contentId) return;

    if (!authStore.user) {
      throw new Error('Debes iniciar sesion para dar me gusta.');
    }
    const requestSessionVersion = authSessionVersion.value;
    const requestUserId = authStore.user.uid;

    if (pendingByContent.value[contentId]) {
      return;
    }

    await primeLikesForContentIds([contentId]);

    const userId = authStore.user.uid;
    const likeRef = doc(db, 'content', contentId, 'likes', userId);
    const wasLiked = Boolean(likedByContent.value[contentId]);

    setPendingLocal(contentId, true);
    setErrorLocal(contentId, null);
    setLikedLocal(contentId, !wasLiked);

    try {
      const toggleCallable = httpsCallable<
        { contentId: string },
        ToggleLikeCallableResponse
      >(firebaseFunctions, 'toggleContentLike');

      try {
        const callableResult = await toggleCallable({ contentId });
        if (
          requestSessionVersion !== authSessionVersion.value ||
          requestUserId !== (authStore.user?.uid || '')
        ) {
          return;
        }
        if (typeof callableResult?.data?.liked === 'boolean') {
          setLikedLocal(contentId, callableResult.data.liked);
        }
      } catch (callableError: any) {
        const callableCode = String(callableError?.code || '');
        const shouldFallback =
          callableCode.includes('not-found') ||
          callableCode.includes('unimplemented') ||
          callableCode.includes('internal');

        if (!shouldFallback) {
          throw callableError;
        }

        // Fallback legacy: escritura directa en likes (contadores via trigger).
        if (wasLiked) {
          await deleteDoc(likeRef);
        } else {
          await setDoc(likeRef, {
            createdAt: Timestamp.now()
          });
        }
      }
      setErrorLocal(contentId, null);
    } catch (error) {
      setLikedLocal(contentId, wasLiked);
      setErrorLocal(
        contentId,
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar el me gusta.'
      );
      throw error;
    } finally {
      if (
        requestSessionVersion === authSessionVersion.value &&
        requestUserId === (authStore.user?.uid || '')
      ) {
        setPendingLocal(contentId, false);
      }
    }
  };

  // Base reusable para futuras interacciones (favoritos/reacciones).
  const primeForContentIds = async (ids: string[]) => {
    await primeLikesForContentIds(ids);
  };

  const toggleForContentOptimistic = async (contentId: string) => {
    await toggleLikeOptimistic(contentId);
  };

  const isActiveForContent = (contentId: string) => isLiked(contentId);

  const isPendingForContent = (contentId: string) => isLikePending(contentId);

  watch(
    () => authStore.user?.uid || '',
    (nextUid, prevUid) => {
      if (nextUid === prevUid) return;
      authSessionVersion.value += 1;
      likedByContent.value = {};
      pendingByContent.value = {};
      errorByContent.value = {};
    }
  );

  return {
    primeLikesForContentIds,
    toggleLikeOptimistic,
    isLiked,
    isLikePending,
    getLikeError,
    isLikesEnabledForModule,
    primeForContentIds,
    toggleForContentOptimistic,
    isActiveForContent,
    isPendingForContent
  };
});
