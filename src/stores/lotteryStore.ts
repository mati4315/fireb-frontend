import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  Timestamp,
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { useAuthStore } from './authStore';

export type LotteryStatus = 'draft' | 'active' | 'closed' | 'completed';

export type LotteryWinner = {
  userId: string;
  userName: string;
  userProfilePicUrl: string;
  selectedAt: Date | null;
};

export type Lottery = {
  id: string;
  title: string;
  description: string;
  status: LotteryStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  participantsCount: number;
  winner: LotteryWinner | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  deletedAt: Date | null;
};

export type LotteryEntry = {
  id: string;
  userId: string;
  userName: string;
  userProfilePicUrl: string;
  lotteryId: string;
  createdAt: Date | null;
};

export type SaveLotteryPayload = {
  title: string;
  description: string;
  status: LotteryStatus;
  startsAt: Date;
  endsAt: Date;
};

type EnterLotteryResponse = {
  status: 'ok' | 'already_joined';
  lotteryId: string;
  participantsCount: number;
};

type DrawLotteryWinnerResponse = {
  status: 'ok';
  lotteryId: string;
  winner: {
    userId: string;
    userName: string;
    userProfilePicUrl: string;
  };
  participantsCount: number;
};

const PUBLIC_PAGE_SIZE = 20;
const ADMIN_PAGE_SIZE = 120;
const ENTRY_PAGE_SIZE = 25;

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const normalizeStatus = (value: unknown): LotteryStatus => {
  if (value === 'draft' || value === 'active' || value === 'closed' || value === 'completed') {
    return value;
  }
  return 'draft';
};

const normalizeWinner = (value: unknown): LotteryWinner | null => {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const userId = typeof data.userId === 'string' ? data.userId : '';
  const userName = typeof data.userName === 'string' ? data.userName : '';
  if (!userId || !userName) return null;
  return {
    userId,
    userName,
    userProfilePicUrl: typeof data.userProfilePicUrl === 'string' ? data.userProfilePicUrl : '',
    selectedAt: toDate(data.selectedAt)
  };
};

const normalizeLottery = (id: string, data: Record<string, unknown>): Lottery => {
  const participantsRaw = Number(data.participantsCount ?? 0);
  return {
    id,
    title: typeof data.title === 'string' ? data.title.trim() : '',
    description: typeof data.description === 'string' ? data.description.trim() : '',
    status: normalizeStatus(data.status),
    startsAt: toDate(data.startsAt),
    endsAt: toDate(data.endsAt),
    participantsCount: Number.isFinite(participantsRaw)
      ? Math.max(0, Math.floor(participantsRaw))
      : 0,
    winner: normalizeWinner(data.winner),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    deletedAt: toDate(data.deletedAt)
  };
};

const normalizeEntry = (id: string, data: Record<string, unknown>): LotteryEntry => {
  return {
    id,
    userId: typeof data.userId === 'string' ? data.userId : '',
    userName: typeof data.userName === 'string' ? data.userName : 'Usuario',
    userProfilePicUrl: typeof data.userProfilePicUrl === 'string' ? data.userProfilePicUrl : '',
    lotteryId: typeof data.lotteryId === 'string' ? data.lotteryId : '',
    createdAt: toDate(data.createdAt)
  };
};

const trimLimited = (value: string, maxLength: number): string => {
  return value.trim().slice(0, maxLength);
};

export const useLotteryStore = defineStore('lottery', () => {
  const authStore = useAuthStore();

  const publicLotteries = ref<Lottery[]>([]);
  const publicLoading = ref(false);
  const publicUnsubscribe = ref<Unsubscribe | null>(null);

  const adminLotteries = ref<Lottery[]>([]);
  const adminLoading = ref(false);
  const adminUnsubscribe = ref<Unsubscribe | null>(null);

  const entriesByLottery = ref<Record<string, LotteryEntry[]>>({});
  const entriesLoadingByLottery = ref<Record<string, boolean>>({});
  const entriesHasMoreByLottery = ref<Record<string, boolean>>({});
  const entriesCursorByLottery = ref<Record<string, QueryDocumentSnapshot<DocumentData> | null>>(
    {}
  );

  const userJoinedByLottery = ref<Record<string, boolean>>({});
  const userEntriesUnsubscribe = ref<Unsubscribe | null>(null);
  const joiningByLottery = ref<Record<string, boolean>>({});
  const drawLoadingByLottery = ref<Record<string, boolean>>({});

  const activePublicLotteries = computed(() =>
    publicLotteries.value.filter((lottery) => lottery.status === 'active')
  );

  const cleanupPublicLotteries = () => {
    if (publicUnsubscribe.value) {
      publicUnsubscribe.value();
      publicUnsubscribe.value = null;
    }
  };

  const cleanupAdminLotteries = () => {
    if (adminUnsubscribe.value) {
      adminUnsubscribe.value();
      adminUnsubscribe.value = null;
    }
  };

  const cleanupUserEntries = () => {
    if (userEntriesUnsubscribe.value) {
      userEntriesUnsubscribe.value();
      userEntriesUnsubscribe.value = null;
    }
  };

  const cleanupAll = () => {
    cleanupPublicLotteries();
    cleanupAdminLotteries();
    cleanupUserEntries();
  };

  const initPublicLotteriesListener = () => {
    if (publicUnsubscribe.value) return;

    publicLoading.value = true;
    const lotteriesQuery = query(
      collection(db, 'lotteries'),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc'),
      limit(PUBLIC_PAGE_SIZE)
    );

    publicUnsubscribe.value = onSnapshot(
      lotteriesQuery,
      (snapshot) => {
        publicLotteries.value = snapshot.docs.map((lotteryDoc) =>
          normalizeLottery(lotteryDoc.id, lotteryDoc.data())
        );
        publicLoading.value = false;
      },
      (error) => {
        console.error('Error loading lotteries:', error);
        publicLoading.value = false;
      }
    );
  };

  const initAdminLotteriesListener = () => {
    if (adminUnsubscribe.value) return;

    adminLoading.value = true;
    const lotteriesQuery = query(
      collection(db, 'lotteries'),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc'),
      limit(ADMIN_PAGE_SIZE)
    );

    adminUnsubscribe.value = onSnapshot(
      lotteriesQuery,
      (snapshot) => {
        adminLotteries.value = snapshot.docs.map((lotteryDoc) =>
          normalizeLottery(lotteryDoc.id, lotteryDoc.data())
        );
        adminLoading.value = false;
      },
      (error) => {
        console.error('Error loading admin lotteries:', error);
        adminLoading.value = false;
      }
    );
  };

  const initUserEntriesListener = () => {
    cleanupUserEntries();
    const userId = authStore.user?.uid;
    if (!userId) {
      userJoinedByLottery.value = {};
      return;
    }

    const joinedQuery = query(
      collectionGroup(db, 'entries'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(300)
    );

    userEntriesUnsubscribe.value = onSnapshot(
      joinedQuery,
      (snapshot) => {
        const nextMap: Record<string, boolean> = {};
        for (const entryDoc of snapshot.docs) {
          const data = entryDoc.data() || {};
          const lotteryId = typeof data.lotteryId === 'string'
            ? data.lotteryId
            : entryDoc.ref.parent.parent?.id || '';
          if (!lotteryId) continue;
          nextMap[lotteryId] = true;
        }
        userJoinedByLottery.value = nextMap;
      },
      (error) => {
        console.error('Error loading joined lotteries:', error);
      }
    );
  };

  watch(
    () => authStore.user?.uid,
    () => {
      initUserEntriesListener();
    },
    { immediate: true }
  );

  const hasJoinedLottery = (lotteryId: string): boolean => {
    return Boolean(userJoinedByLottery.value[lotteryId]);
  };

  const isLotteryOpenForEntry = (lottery: Lottery, nowMs: number = Date.now()): boolean => {
    if (lottery.status !== 'active') return false;
    if (lottery.winner) return false;
    if (lottery.startsAt && lottery.startsAt.getTime() > nowMs) return false;
    if (lottery.endsAt && lottery.endsAt.getTime() < nowMs) return false;
    return true;
  };

  const isJoiningLottery = (lotteryId: string): boolean => {
    return Boolean(joiningByLottery.value[lotteryId]);
  };

  const isDrawingLottery = (lotteryId: string): boolean => {
    return Boolean(drawLoadingByLottery.value[lotteryId]);
  };

  const mapLotteries = (updater: (lottery: Lottery) => Lottery) => {
    publicLotteries.value = publicLotteries.value.map(updater);
    adminLotteries.value = adminLotteries.value.map(updater);
  };

  const updateLotteryById = (lotteryId: string, updater: (lottery: Lottery) => Lottery) => {
    mapLotteries((lottery) => (lottery.id === lotteryId ? updater(lottery) : lottery));
  };

  const setJoining = (lotteryId: string, value: boolean) => {
    if (value) {
      joiningByLottery.value = {
        ...joiningByLottery.value,
        [lotteryId]: true
      };
      return;
    }
    const next = { ...joiningByLottery.value };
    delete next[lotteryId];
    joiningByLottery.value = next;
  };

  const setDrawing = (lotteryId: string, value: boolean) => {
    if (value) {
      drawLoadingByLottery.value = {
        ...drawLoadingByLottery.value,
        [lotteryId]: true
      };
      return;
    }
    const next = { ...drawLoadingByLottery.value };
    delete next[lotteryId];
    drawLoadingByLottery.value = next;
  };

  const resetEntries = (lotteryId: string) => {
    entriesByLottery.value[lotteryId] = [];
    entriesCursorByLottery.value[lotteryId] = null;
    entriesHasMoreByLottery.value[lotteryId] = true;
  };

  const loadEntries = async (lotteryId: string, options: { reset?: boolean } = {}) => {
    const reset = Boolean(options.reset);
    if (entriesLoadingByLottery.value[lotteryId]) return;
    if (!reset && entriesHasMoreByLottery.value[lotteryId] === false) return;

    if (reset) {
      resetEntries(lotteryId);
    }

    entriesLoadingByLottery.value = {
      ...entriesLoadingByLottery.value,
      [lotteryId]: true
    };

    try {
      const constraints: Array<
        ReturnType<typeof orderBy> | ReturnType<typeof limit> | ReturnType<typeof startAfter>
      > = [orderBy('createdAt', 'desc'), limit(ENTRY_PAGE_SIZE)];
      const cursor = entriesCursorByLottery.value[lotteryId];
      if (!reset && cursor) {
        constraints.push(startAfter(cursor));
      }

      const entriesQuery = query(
        collection(db, 'lotteries', lotteryId, 'entries'),
        ...constraints
      );

      const snapshot = await getDocs(entriesQuery);
      const batchEntries = snapshot.docs.map((entryDoc) =>
        normalizeEntry(entryDoc.id, entryDoc.data())
      );

      if (reset) {
        entriesByLottery.value[lotteryId] = batchEntries;
      } else {
        const existing = entriesByLottery.value[lotteryId] || [];
        const deduped = batchEntries.filter(
          (entry) => !existing.some((current) => current.id === entry.id)
        );
        entriesByLottery.value[lotteryId] = [...existing, ...deduped];
      }

      entriesHasMoreByLottery.value[lotteryId] = snapshot.size >= ENTRY_PAGE_SIZE;
      entriesCursorByLottery.value[lotteryId] = snapshot.docs.length > 0
        ? snapshot.docs[snapshot.docs.length - 1]
        : null;
    } catch (error) {
      console.error('Error loading lottery entries:', error);
    } finally {
      const next = { ...entriesLoadingByLottery.value };
      delete next[lotteryId];
      entriesLoadingByLottery.value = next;
    }
  };

  const getEntries = (lotteryId: string): LotteryEntry[] => {
    return entriesByLottery.value[lotteryId] || [];
  };

  const hasMoreEntries = (lotteryId: string): boolean => {
    return entriesHasMoreByLottery.value[lotteryId] ?? true;
  };

  const isEntriesLoading = (lotteryId: string): boolean => {
    return Boolean(entriesLoadingByLottery.value[lotteryId]);
  };

  const createLottery = async (payload: SaveLotteryPayload) => {
    const userId = authStore.user?.uid || 'system';
    const title = trimLimited(payload.title, 150);
    const description = trimLimited(payload.description, 2000);
    if (!title) {
      throw new Error('El titulo es obligatorio.');
    }
    if (!(payload.startsAt instanceof Date) || Number.isNaN(payload.startsAt.getTime())) {
      throw new Error('Fecha de inicio invalida.');
    }
    if (!(payload.endsAt instanceof Date) || Number.isNaN(payload.endsAt.getTime())) {
      throw new Error('Fecha de cierre invalida.');
    }
    if (payload.endsAt.getTime() <= payload.startsAt.getTime()) {
      throw new Error('La fecha de cierre debe ser posterior al inicio.');
    }

    await addDoc(collection(db, 'lotteries'), {
      title,
      description,
      status: payload.status,
      startsAt: Timestamp.fromDate(payload.startsAt),
      endsAt: Timestamp.fromDate(payload.endsAt),
      participantsCount: 0,
      winner: null,
      createdBy: userId,
      updatedBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletedAt: null
    });
  };

  const updateLottery = async (lotteryId: string, payload: SaveLotteryPayload) => {
    const userId = authStore.user?.uid || 'system';
    const title = trimLimited(payload.title, 150);
    const description = trimLimited(payload.description, 2000);
    if (!title) {
      throw new Error('El titulo es obligatorio.');
    }
    if (!(payload.startsAt instanceof Date) || Number.isNaN(payload.startsAt.getTime())) {
      throw new Error('Fecha de inicio invalida.');
    }
    if (!(payload.endsAt instanceof Date) || Number.isNaN(payload.endsAt.getTime())) {
      throw new Error('Fecha de cierre invalida.');
    }
    if (payload.endsAt.getTime() <= payload.startsAt.getTime()) {
      throw new Error('La fecha de cierre debe ser posterior al inicio.');
    }

    await setDoc(
      doc(db, 'lotteries', lotteryId),
      {
        title,
        description,
        status: payload.status,
        startsAt: Timestamp.fromDate(payload.startsAt),
        endsAt: Timestamp.fromDate(payload.endsAt),
        updatedBy: userId,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  };

  const closeLottery = async (lotteryId: string) => {
    const userId = authStore.user?.uid || 'system';
    await setDoc(
      doc(db, 'lotteries', lotteryId),
      {
        status: 'closed',
        updatedBy: userId,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  };

  const activateLottery = async (lotteryId: string) => {
    const userId = authStore.user?.uid || 'system';
    await setDoc(
      doc(db, 'lotteries', lotteryId),
      {
        status: 'active',
        winner: null,
        updatedBy: userId,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  };

  const softDeleteLottery = async (lotteryId: string) => {
    const userId = authStore.user?.uid || 'system';
    await setDoc(
      doc(db, 'lotteries', lotteryId),
      {
        deletedAt: serverTimestamp(),
        updatedBy: userId,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  };

  const setLotteryModuleEnabled = async (enabled: boolean) => {
    await setDoc(
      doc(db, '_config', 'modules'),
      {
        lottery: {
          enabled: Boolean(enabled)
        }
      },
      { merge: true }
    );
  };

  const joinLottery = async (lotteryId: string) => {
    if (!authStore.isAuthenticated) {
      throw new Error('Debes iniciar sesion para participar.');
    }

    if (hasJoinedLottery(lotteryId)) {
      return { status: 'already_joined', lotteryId, participantsCount: 0 } as EnterLotteryResponse;
    }

    const previousCounts = new Map<string, number>();
    mapLotteries((lottery) => {
      if (lottery.id !== lotteryId) return lottery;
      previousCounts.set(lottery.id, lottery.participantsCount);
      return {
        ...lottery,
        participantsCount: Math.max(0, lottery.participantsCount + 1)
      };
    });
    userJoinedByLottery.value = {
      ...userJoinedByLottery.value,
      [lotteryId]: true
    };

    setJoining(lotteryId, true);
    try {
      const enterLotteryCallable = httpsCallable(functions, 'enterLottery');
      const response = await enterLotteryCallable({
        lotteryId,
        idempotencyKey: `${lotteryId}_${Date.now()}`
      });

      const payload = (response.data || {}) as EnterLotteryResponse;
      if (typeof payload.participantsCount === 'number') {
        updateLotteryById(lotteryId, (lottery) => ({
          ...lottery,
          participantsCount: Math.max(0, Math.floor(payload.participantsCount))
        }));
      }

      return payload;
    } catch (error: any) {
      const fallbackCount = previousCounts.get(lotteryId) ?? 0;
      updateLotteryById(lotteryId, (lottery) => ({
        ...lottery,
        participantsCount: fallbackCount
      }));

      const nextJoined = { ...userJoinedByLottery.value };
      delete nextJoined[lotteryId];
      userJoinedByLottery.value = nextJoined;

      const code = error?.code || '';
      if (code === 'functions/already-exists') {
        userJoinedByLottery.value = {
          ...userJoinedByLottery.value,
          [lotteryId]: true
        };
      }
      throw error;
    } finally {
      setJoining(lotteryId, false);
    }
  };

  const drawLotteryWinner = async (lotteryId: string) => {
    setDrawing(lotteryId, true);
    try {
      const drawCallable = httpsCallable(functions, 'drawLotteryWinner');
      const response = await drawCallable({ lotteryId });
      const payload = (response.data || {}) as DrawLotteryWinnerResponse;
      updateLotteryById(lotteryId, (lottery) => ({
        ...lottery,
        status: 'completed',
        participantsCount: Math.max(0, Math.floor(payload.participantsCount || lottery.participantsCount)),
        winner: {
          userId: payload.winner.userId,
          userName: payload.winner.userName,
          userProfilePicUrl: payload.winner.userProfilePicUrl || '',
          selectedAt: new Date()
        }
      }));
      return payload;
    } finally {
      setDrawing(lotteryId, false);
    }
  };

  return {
    publicLotteries,
    publicLoading,
    activePublicLotteries,
    adminLotteries,
    adminLoading,
    userJoinedByLottery,
    hasJoinedLottery,
    isLotteryOpenForEntry,
    isJoiningLottery,
    isDrawingLottery,
    initPublicLotteriesListener,
    cleanupPublicLotteries,
    initAdminLotteriesListener,
    cleanupAdminLotteries,
    initUserEntriesListener,
    loadEntries,
    getEntries,
    hasMoreEntries,
    isEntriesLoading,
    createLottery,
    updateLottery,
    closeLottery,
    activateLottery,
    softDeleteLottery,
    setLotteryModuleEnabled,
    joinLottery,
    drawLotteryWinner,
    cleanupAll
  };
});
