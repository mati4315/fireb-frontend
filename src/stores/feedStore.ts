import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  startAfter,
  getDocs,
  addDoc,
  or,
  type Unsubscribe,
  type QueryConstraint
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from './authStore';

export const useFeedStore = defineStore('feed', () => {
  const authStore = useAuthStore();

  const allItems = ref<any[]>([]);
  // tabs: 'todo' | 'news' | 'post'
  const currentTab = ref('todo');
  const loading = ref(false);
  const hasMore = ref(true);
  const unsubscribe = ref<Unsubscribe | null>(null);

  // Configuración de módulos para cada pestaña (Tab -> { module, type })
  // Esto permite escalar fácilmente a más módulos sin hardcodear
  const tabConfig: Record<string, { module: string, type: string }> = {
    'news': { module: 'news', type: 'news' },
    'post': { module: 'community', type: 'post' } // 'post' es la tab "Comunidad"
  };

  // Helper para generar los constraints dependiendo de la tab activa
  const getTabConstraints = (): QueryConstraint[] => {
    const constraints: QueryConstraint[] = [where('deletedAt', '==', null)];
    
    if (currentTab.value !== 'todo') {
      const cfg = tabConfig[currentTab.value];
      if (cfg) {
        // En "Noticias", traer module:news OR type:news
        // En "Comunidad", traer module:community OR type:post
        constraints.push(or(
          where('module', '==', cfg.module),
          where('type', '==', cfg.type)
        ));
      }
    }
    
    // Sort
    constraints.push(orderBy('createdAt', 'desc'));
    return constraints;
  };

  // Inicializar real-time listener para la currentTab
  const initFeed = (tabName: string = 'todo') => {
    if (currentTab.value !== tabName || !unsubscribe.value) {
      if (unsubscribe.value) {
        unsubscribe.value();
      }
      currentTab.value = tabName;
      allItems.value = [];
      loading.value = true;
      hasMore.value = true;
      
      try {
        const q = query(
          collection(db, 'content'),
          ...getTabConstraints(),
          limit(20)
        );

        // Real-time listener
        unsubscribe.value = onSnapshot(q, (snapshot) => {
          const items: any[] = [];
          snapshot.forEach((doc) => {
            items.push({
              id: doc.id,
              ...doc.data()
            });
          });

          // Unificamos todo en allItems, ya la query hace el filtrado server-side
          allItems.value = items;
          loading.value = false;
          hasMore.value = items.length >= 20; 
        });
      } catch (error) {
        console.error('Error initializing feed:', error);
        loading.value = false;
      }
    }
  };

  // Cargar más items
  const loadMore = async () => {
    if (!hasMore.value || loading.value || allItems.value.length === 0) return;

    loading.value = true;

    try {
      const lastItem = allItems.value[allItems.value.length - 1];

      const q = query(
        collection(db, 'content'),
        ...getTabConstraints(),
        startAfter(lastItem.createdAt),
        limit(20)
      );

      const snapshot = await getDocs(q);
      const newItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Deduplicar
      const newItemsFiltered = newItems.filter(
        newItem => !allItems.value.some(existing => existing.id === newItem.id)
      );

      allItems.value.push(...newItemsFiltered);
      hasMore.value = newItems.length >= 20;
    } catch (error) {
      console.error('Error loading more:', error);
    } finally {
      loading.value = false;
    }
  };

  // Crear nuevo post
  const createPost = async (titulo: string, descripcion: string, images: string[] = []) => {
    if (!authStore.user || !authStore.userProfile) {
      throw new Error('No autenticado');
    }

    try {
      const newPost = {
        type: 'post',
        source: 'user',              // Para distinguir del wordpress
        module: 'community',         // Preparado para futuro
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
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      };

      const docRef = await addDoc(collection(db, 'content'), newPost);
      return { id: docRef.id, ...newPost };
    } catch (error) {
      console.error('Error creating post:', error);
      throw error;
    }
  };

  const cleanup = () => {
    if (unsubscribe.value) {
      unsubscribe.value();
    }
  };

  return {
    allItems,
    currentTab,
    loading,
    hasMore,
    initFeed,
    loadMore,
    createPost,
    cleanup
  };
});
