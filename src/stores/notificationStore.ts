import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { app, db, functions } from '@/config/firebase';
import { useAuthStore } from './authStore';
import { buildStableDeviceId, isNativePlatform } from '@/platform/capacitor';

type NotificationType = 'like' | 'comment' | 'reply' | 'follow';

type NotificationSettings = {
  notificationsEnabled: boolean;
  likes: boolean;
  comments: boolean;
  replies: boolean;
  follows: boolean;
};

export type NotificationRecord = {
  id: string;
  type: NotificationType;
  recipientUserId: string;
  actorUserId: string;
  actorName: string;
  actorUsername: string;
  actorProfilePictureUrl: string;
  contentId: string;
  contentModule: 'news' | 'community' | '';
  contentPublicRef: string;
  contentSlug: string;
  commentId: string;
  replyId: string;
  targetPath: string;
  isRead: boolean;
  readAt: any;
  eventCount: number;
  createdAt: any;
  updatedAt: any;
  lastEventAt: any;
};

type NotificationPageState = {
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

const PAGE_SIZE = 20;
const WEB_DEVICE_ID_KEY = 'cdelu_notifications_web_device_id_v1';
const NATIVE_PUSH_DEVICE_ID_KEY = 'cdelu_notifications_native_device_id_v1';
const NATIVE_PUSH_TOKEN_KEY = 'cdelu_notifications_native_token_v1';
const PUSH_NUDGE_DISMISSED_KEY = 'cdelu_push_nudge_dismissed_v1';
const PUSH_NUDGE_NEXT_AT_KEY = 'cdelu_push_nudge_next_at_v1';
const PUSH_NUDGE_DISMISS_COUNT_KEY = 'cdelu_push_nudge_dismiss_count_v1';
const PUSH_NUDGE_BASE_COOLDOWN_DAYS = 3;
const PUSH_NUDGE_MAX_COOLDOWN_DAYS = 21;

const toSafeString = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizeNotificationType = (value: unknown): NotificationType => {
  if (value === 'like' || value === 'comment' || value === 'reply' || value === 'follow') {
    return value;
  }
  return 'comment';
};

const mapNotificationDoc = (
  notificationDoc: QueryDocumentSnapshot<DocumentData>
): NotificationRecord => {
  const data = notificationDoc.data() || {};
  const eventCountRaw = Number(data.eventCount ?? 1);

  return {
    id: notificationDoc.id,
    type: normalizeNotificationType(data.type),
    recipientUserId: toSafeString(data.recipientUserId),
    actorUserId: toSafeString(data.actorUserId),
    actorName: toSafeString(data.actorName) || 'Usuario',
    actorUsername: toSafeString(data.actorUsername),
    actorProfilePictureUrl: toSafeString(data.actorProfilePictureUrl),
    contentId: toSafeString(data.contentId),
    contentModule: data.contentModule === 'news' || data.contentModule === 'community'
      ? data.contentModule
      : '',
    contentPublicRef: toSafeString(data.contentPublicRef),
    contentSlug: toSafeString(data.contentSlug),
    commentId: toSafeString(data.commentId),
    replyId: toSafeString(data.replyId),
    targetPath: toSafeString(data.targetPath) || '/notificaciones',
    isRead: data.isRead === true,
    readAt: data.readAt || null,
    eventCount: Number.isFinite(eventCountRaw) ? Math.max(1, Math.floor(eventCountRaw)) : 1,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    lastEventAt: data.lastEventAt || data.createdAt || null
  };
};

const buildWebDeviceId = (): string => {
  const randomChunk = Math.random().toString(36).slice(2, 12);
  const timeChunk = Date.now().toString(36);
  return `web_${timeChunk}_${randomChunk}`;
};

const getOrCreateWebDeviceId = (): string => {
  if (typeof window === 'undefined') return buildWebDeviceId();
  const existing = localStorage.getItem(WEB_DEVICE_ID_KEY) || '';
  if (existing) return existing;
  const next = buildWebDeviceId();
  localStorage.setItem(WEB_DEVICE_ID_KEY, next);
  return next;
};

const getCurrentNotificationSettings = (profile: any): NotificationSettings => {
  const settings = (profile?.settings || {}) as Record<string, unknown>;
  const rawTypes = (settings.notificationTypes || {}) as Record<string, unknown>;
  return {
    notificationsEnabled: settings.notificationsEnabled !== false,
    likes: rawTypes.likes !== false,
    comments: rawTypes.comments !== false,
    replies: rawTypes.replies !== false,
    follows: rawTypes.follows !== false
  };
};

const formatRelativeDate = (timestampValue: any): string => {
  if (!timestampValue) return '';
  const date = timestampValue?.toDate ? timestampValue.toDate() : new Date(timestampValue);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

  const nowMs = Date.now();
  const diffMs = Math.max(0, nowMs - date.getTime());
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) return 'Ahora';
  if (diffMs < hourMs) return `Hace ${Math.floor(diffMs / minuteMs)} min`;
  if (diffMs < dayMs) return `Hace ${Math.floor(diffMs / hourMs)} h`;
  if (diffMs < 7 * dayMs) return `Hace ${Math.floor(diffMs / dayMs)} d`;

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

export const useNotificationStore = defineStore('notifications', () => {
  const authStore = useAuthStore();

  const items = ref<NotificationRecord[]>([]);
  const unreadCount = ref(0);
  const loading = ref(false);
  const loadingMore = ref(false);
  const initializedForUid = ref('');
  const pageState = ref<NotificationPageState>({
    cursor: null,
    hasMore: true
  });
  const pushLoading = ref(false);
  const pushError = ref<string | null>(null);
  const broadcastLoading = ref(false);
  const broadcastError = ref<string | null>(null);
  const preferenceSaving = ref(false);
  const preferenceError = ref<string | null>(null);
  const pushPermissionState = ref<'granted' | 'denied' | 'prompt' | 'unsupported'>('prompt');

  let listUnsubscribe: Unsubscribe | null = null;
  let unreadUnsubscribe: Unsubscribe | null = null;
  let foregroundListenerAttached = false;
  let nativePushInitialized = false;

  const isAuthenticated = computed(() => Boolean(authStore.user?.uid));
  const settings = computed<NotificationSettings>(() =>
    getCurrentNotificationSettings(authStore.userProfile)
  );
  const canLoadMore = computed(() => pageState.value.hasMore && !loadingMore.value);
  const browserPermission = computed(() => {
    if (isNativePlatform()) return pushPermissionState.value;
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission as 'granted' | 'denied' | 'prompt';
  });

  const shouldShowPushNudge = computed(() => {
    if (!authStore.user?.uid) return false;
    if (localStorage.getItem(PUSH_NUDGE_DISMISSED_KEY) === '1') return false;
    const nowMs = Date.now();
    const nextAtMs = Number(localStorage.getItem(PUSH_NUDGE_NEXT_AT_KEY) || '0');
    if (Number.isFinite(nextAtMs) && nextAtMs > nowMs) return false;
    if (settings.value.notificationsEnabled === false) return true;
    return browserPermission.value !== 'granted';
  });

  const clearState = () => {
    items.value = [];
    unreadCount.value = 0;
    pageState.value = {
      cursor: null,
      hasMore: true
    };
  };

  const detachListeners = () => {
    if (listUnsubscribe) {
      listUnsubscribe();
      listUnsubscribe = null;
    }
    if (unreadUnsubscribe) {
      unreadUnsubscribe();
      unreadUnsubscribe = null;
    }
  };

  const getUserNotificationsCollection = (uid: string) =>
    collection(db, 'users', uid, 'notifications');

  const initListeners = (uid: string) => {
    detachListeners();
    clearState();

    loading.value = true;
    const notificationsCollection = getUserNotificationsCollection(uid);
    const firstPageQuery = query(
      notificationsCollection,
      orderBy('lastEventAt', 'desc'),
      limit(PAGE_SIZE)
    );

    listUnsubscribe = onSnapshot(
      firstPageQuery,
      (snapshot) => {
        const docs = snapshot.docs;
        items.value = docs.map(mapNotificationDoc);
        pageState.value = {
          cursor: docs.length > 0 ? docs[docs.length - 1] : null,
          hasMore: docs.length === PAGE_SIZE
        };
        loading.value = false;
      },
      (error) => {
        console.error('Error loading notifications:', error);
        loading.value = false;
      }
    );

    const unreadQuery = query(notificationsCollection, where('isRead', '==', false));
    unreadUnsubscribe = onSnapshot(
      unreadQuery,
      (snapshot) => {
        unreadCount.value = snapshot.size;
      },
      (error) => {
        console.error('Error loading unread notification count:', error);
      }
    );
  };

  const ensureForegroundPushListener = async () => {
    if (isNativePlatform()) return;
    if (foregroundListenerAttached) return;
    if (typeof window === 'undefined') return;
    const { isSupported, getMessaging, onMessage } = await import('firebase/messaging');
    const supported = await isSupported().catch(() => false);
    if (!supported) return;

    const messaging = getMessaging(app);
    onMessage(messaging, () => {
      // Firestore listeners already refresh the in-app list and badge.
    });
    foregroundListenerAttached = true;
  };

  const ensureNativePushRegistration = async () => {
    if (!isNativePlatform()) return;
    if (!authStore.user?.uid) return;

    const { PushNotifications } = await import('@capacitor/push-notifications')

    await PushNotifications.createChannel({
      id: 'general_notifications',
      name: 'Notificaciones generales',
      description: 'Avisos y actividad de tu cuenta',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true
    }).catch(() => undefined)

    if (!nativePushInitialized) {
      PushNotifications.addListener('registration', async (token) => {
        const registerCallable = httpsCallable(functions, 'registerNotificationDevice')
        const existingDeviceId = localStorage.getItem(NATIVE_PUSH_DEVICE_ID_KEY) || ''
        const deviceId = existingDeviceId || await buildStableDeviceId()
        localStorage.setItem(NATIVE_PUSH_DEVICE_ID_KEY, deviceId)
        localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, token.value || '')

        await registerCallable({
          token: token.value,
          platform: 'android',
          deviceId,
          locale: navigator.language || '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
          userAgent: navigator.userAgent || ''
        })
      })

      PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
        const targetPath = String(event.notification?.data?.targetPath || '/notificaciones')
        window.dispatchEvent(new CustomEvent('native:push-open', { detail: { targetPath } }))
      })

      nativePushInitialized = true;
    }

    const permissions = await PushNotifications.checkPermissions()
    if (permissions.receive === 'granted') {
      pushPermissionState.value = 'granted'
    } else if (permissions.receive === 'denied') {
      pushPermissionState.value = 'denied'
    } else {
      pushPermissionState.value = 'prompt'
    }

    if (permissions.receive !== 'granted') {
      const request = await PushNotifications.requestPermissions()
      if (request.receive !== 'granted') {
        pushPermissionState.value = request.receive === 'denied' ? 'denied' : 'prompt'
        throw new Error('Permiso de notificaciones denegado.')
      }
      pushPermissionState.value = 'granted'
    }

    await PushNotifications.register()
  }

  const unregisterNativePush = async () => {
    if (!isNativePlatform()) return;
    const deviceId = localStorage.getItem(NATIVE_PUSH_DEVICE_ID_KEY) || ''
    const token = localStorage.getItem(NATIVE_PUSH_TOKEN_KEY) || ''
    if (!deviceId && !token) return;

    const unregisterCallable = httpsCallable(functions, 'unregisterNotificationDevice')
    await unregisterCallable({ deviceId, token })
  }

  const init = async () => {
    const uid = authStore.user?.uid || '';
    if (!uid) {
      initializedForUid.value = '';
      detachListeners();
      clearState();
      return;
    }

    if (initializedForUid.value === uid && listUnsubscribe && unreadUnsubscribe) {
      return;
    }

    initializedForUid.value = uid;
    initListeners(uid);
    await ensureForegroundPushListener();
    await ensureNativePushRegistration();
  };

  const cleanup = () => {
    initializedForUid.value = '';
    detachListeners();
    clearState();
  };

  const loadMore = async () => {
    const uid = authStore.user?.uid || '';
    if (!uid || !canLoadMore.value || !pageState.value.cursor) return;

    loadingMore.value = true;
    try {
      const notificationsCollection = getUserNotificationsCollection(uid);
      const nextQuery = query(
        notificationsCollection,
        orderBy('lastEventAt', 'desc'),
        startAfter(pageState.value.cursor),
        limit(PAGE_SIZE)
      );
      const snapshot = await getDocs(nextQuery);
      const fetchedItems = snapshot.docs.map(mapNotificationDoc);
      const merged = [...items.value];

      for (const incoming of fetchedItems) {
        if (merged.some((item) => item.id === incoming.id)) continue;
        merged.push(incoming);
      }

      items.value = merged;
      pageState.value = {
        cursor: snapshot.docs.length > 0
          ? snapshot.docs[snapshot.docs.length - 1]
          : pageState.value.cursor,
        hasMore: snapshot.docs.length === PAGE_SIZE
      };
    } catch (error) {
      console.error('Error loading more notifications:', error);
    } finally {
      loadingMore.value = false;
    }
  };

  const markNotificationRead = async (notificationId: string) => {
    if (!notificationId || !authStore.user?.uid) return;
    const target = items.value.find((item) => item.id === notificationId);
    if (!target || target.isRead) return;

    target.isRead = true;
    const callable = httpsCallable(functions, 'markNotificationRead');
    try {
      await callable({ notificationId });
    } catch (error) {
      target.isRead = false;
      throw error;
    }
  };

  const markAllRead = async () => {
    if (!authStore.user?.uid) return;
    const callable = httpsCallable(functions, 'markAllNotificationsRead');
    await callable({});
    items.value = items.value.map((item) => ({ ...item, isRead: true }));
  };

  const updatePreferences = async (next: Partial<NotificationSettings>) => {
    if (!authStore.user?.uid) {
      throw new Error('No autenticado');
    }

    preferenceSaving.value = true;
    preferenceError.value = null;
    const callable = httpsCallable(functions, 'updateNotificationPreferences');
    try {
      const response = await callable(next);
      const result = (response.data || {}) as Record<string, unknown>;
      if (result.settings) {
        authStore.setUserProfile({
          settings: result.settings
        });
      }
    } catch (error: any) {
      preferenceError.value = error?.message || 'No se pudieron guardar las preferencias.';
      throw error;
    } finally {
      preferenceSaving.value = false;
    }
  };

  const enableWebPush = async () => {
    if (isNativePlatform()) {
      await ensureNativePushRegistration()
      localStorage.removeItem(PUSH_NUDGE_DISMISSED_KEY)
      localStorage.removeItem(PUSH_NUDGE_NEXT_AT_KEY)
      localStorage.removeItem(PUSH_NUDGE_DISMISS_COUNT_KEY)
      return
    }
    if (!authStore.user?.uid) {
      throw new Error('Debes iniciar sesion para activar push.');
    }
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      throw new Error('Este navegador no soporta notificaciones push.');
    }

    pushLoading.value = true;
    pushError.value = null;

    try {
      const vapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();
      if (!vapidKey) {
        throw new Error('Falta configurar VITE_FIREBASE_VAPID_KEY.');
      }

      const currentPermission = Notification.permission;
      const permission = currentPermission === 'default'
        ? await Notification.requestPermission()
        : currentPermission;
      if (permission !== 'granted') {
        throw new Error('Permiso de notificaciones denegado.');
      }

      const serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const { isSupported, getMessaging, getToken } = await import('firebase/messaging');
      const supported = await isSupported().catch(() => false);
      if (!supported) {
        throw new Error('Este navegador no soporta Firebase Messaging.');
      }

      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration
      });
      if (!token) {
        throw new Error('No se pudo obtener el token de push.');
      }

      const registerCallable = httpsCallable(functions, 'registerNotificationDevice');
      await registerCallable({
        token,
        platform: 'web',
        deviceId: getOrCreateWebDeviceId(),
        locale: navigator.language || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        userAgent: navigator.userAgent || ''
      });

      await ensureForegroundPushListener();
      localStorage.removeItem(PUSH_NUDGE_DISMISSED_KEY)
      localStorage.removeItem(PUSH_NUDGE_NEXT_AT_KEY)
      localStorage.removeItem(PUSH_NUDGE_DISMISS_COUNT_KEY)
    } catch (error: any) {
      pushError.value = error?.message || 'No se pudo activar push web.';
      throw error;
    } finally {
      pushLoading.value = false;
    }
  };

  const disableNativePush = async () => {
    if (!authStore.user?.uid) {
      await unregisterNativePush().catch(() => undefined)
      return
    }
    await unregisterNativePush()
  }

  const dismissPushNudge = () => {
    const currentDismissCountRaw = Number(localStorage.getItem(PUSH_NUDGE_DISMISS_COUNT_KEY) || '0')
    const currentDismissCount = Number.isFinite(currentDismissCountRaw)
      ? Math.max(0, Math.floor(currentDismissCountRaw))
      : 0
    const nextDismissCount = currentDismissCount + 1
    const cooldownDays = Math.min(
      PUSH_NUDGE_BASE_COOLDOWN_DAYS * nextDismissCount,
      PUSH_NUDGE_MAX_COOLDOWN_DAYS
    )
    const nextAtMs = Date.now() + cooldownDays * 24 * 60 * 60 * 1000

    localStorage.setItem(PUSH_NUDGE_DISMISS_COUNT_KEY, String(nextDismissCount))
    localStorage.setItem(PUSH_NUDGE_NEXT_AT_KEY, String(nextAtMs))
  }

  const disableWebPush = async () => {
    if (!authStore.user?.uid) return;
    pushLoading.value = true;
    pushError.value = null;

    try {
      const unregisterCallable = httpsCallable(functions, 'unregisterNotificationDevice');
      await unregisterCallable({
        deviceId: getOrCreateWebDeviceId()
      });
    } catch (error: any) {
      pushError.value = error?.message || 'No se pudo desactivar push web.';
      throw error;
    } finally {
      pushLoading.value = false;
    }
  };

  const getMessageSuffix = (item: NotificationRecord): string => {
    if (item.type === 'like') {
      const suffix = item.eventCount > 1 ? ` (${item.eventCount})` : '';
      return `le dio me gusta a tu publicacion${suffix}.`;
    }
    if (item.type === 'comment') return 'comento tu publicacion.';
    if (item.type === 'reply') return 'respondio tu comentario.';
    return 'empezo a seguirte.';
  };

  const getMessage = (item: NotificationRecord): string => {
    return `${item.actorName} ${getMessageSuffix(item)}`;
  };

  const sendTestPushBroadcast = async (input?: {
    title?: string;
    body?: string;
    targetPath?: string;
    platform?: 'all' | 'android' | 'web';
  }) => {
    broadcastLoading.value = true;
    broadcastError.value = null;
    try {
      const callable = httpsCallable(functions, 'sendTestPushToAllUsers');
      const response = await callable({
        title: input?.title || '',
        body: input?.body || '',
        targetPath: input?.targetPath || '/notificaciones',
        platform: input?.platform || 'all'
      });
      return response.data as Record<string, unknown>;
    } catch (error: any) {
      broadcastError.value = error?.message || 'No se pudo enviar la notificacion de prueba.';
      throw error;
    } finally {
      broadcastLoading.value = false;
    }
  };

  return {
    items,
    unreadCount,
    loading,
    loadingMore,
    pushLoading,
    pushError,
    broadcastLoading,
    broadcastError,
    preferenceSaving,
    preferenceError,
    isAuthenticated,
    settings,
    canLoadMore,
    browserPermission,
    shouldShowPushNudge,
    init,
    cleanup,
    loadMore,
    markNotificationRead,
    markAllRead,
    updatePreferences,
    enableWebPush,
    disableWebPush,
    disableNativePush,
    dismissPushNudge,
    sendTestPushBroadcast,
    getMessageSuffix,
    getMessage,
    formatRelativeDate
  };
});
