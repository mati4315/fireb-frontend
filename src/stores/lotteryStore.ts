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
  where,
  type Unsubscribe
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { useAuthStore } from './authStore';

export type LotteryStatus = 'draft' | 'active' | 'closed' | 'completed';
export type LotteryMigrationStatus = 'pending' | 'running' | 'done' | 'failed';
export type LotteryNumberFilter = 'all' | 'available' | 'sold';

export type LotteryWinner = {
  userId: string;
  userName: string;
  userProfilePicUrl: string;
  selectedNumber: number | null;
  selectedAt: Date | null;
};

export type Lottery = {
  id: string;
  title: string;
  description: string;
  status: LotteryStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  maxNumber: number;
  maxTicketsPerUser: number;
  participantsCount: number;
  winner: LotteryWinner | null;
  entrySchemaVersion: number;
  migrationStatus: LotteryMigrationStatus;
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
  selectedNumber: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type LotteryNumberCell = {
  number: number;
  entry: LotteryEntry | null;
  state: 'available' | 'sold' | 'mine';
};

export type SaveLotteryPayload = {
  title: string;
  description: string;
  status: LotteryStatus;
  startsAt: Date;
  endsAt: Date;
  maxNumber: number;
  maxTicketsPerUser: number;
};

type EnterLotteryResponse = {
  status: 'ok' | 'already_selected';
  lotteryId: string;
  selectedNumber?: number;
  participantsCount: number;
  userTicketsCount: number;
};

type DrawLotteryWinnerResponse = {
  status: 'ok';
  lotteryId: string;
  winner: {
    userId: string;
    userName: string;
    userProfilePicUrl: string;
    selectedNumber: number | null;
  };
  participantsCount: number;
};

const PUBLIC_PAGE_SIZE = 20;
const ADMIN_PAGE_SIZE = 120;
const NUMBER_PAGE_SIZE = 50;
const USER_ENTRIES_LIMIT = 500;
const DEFAULT_MAX_NUMBER = 100;
const DEFAULT_MAX_TICKETS_PER_USER = 1;
const MIN_MAX_NUMBER = 10;
const MAX_MAX_NUMBER = 200;
const MIN_MAX_TICKETS_PER_USER = 1;
const MAX_MAX_TICKETS_PER_USER = 5;

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

const clampInteger = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (!Number.isFinite(floored)) return fallback;
  if (floored < min) return min;
  if (floored > max) return max;
  return floored;
};

const parseSelectedNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const floored = Math.floor(parsed);
  if (floored !== parsed) return null;
  if (floored <= 0) return null;
  return floored;
};

const toLotteryEntryId = (selectedNumber: number): string => `n_${selectedNumber}`;

const normalizeStatus = (value: unknown): LotteryStatus => {
  if (value === 'draft' || value === 'active' || value === 'closed' || value === 'completed') {
    return value;
  }
  return 'draft';
};

const normalizeMigrationStatus = (value: unknown): LotteryMigrationStatus => {
  if (value === 'pending' || value === 'running' || value === 'done' || value === 'failed') {
    return value;
  }
  return 'done';
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
    selectedNumber: parseSelectedNumber(data.selectedNumber),
    selectedAt: toDate(data.selectedAt)
  };
};

const normalizeLottery = (id: string, data: Record<string, unknown>): Lottery => {
  const participantsRaw = Number(data.participantsCount ?? 0);
  const entrySchemaRaw = Number(data.entrySchemaVersion ?? 2);
  return {
    id,
    title: typeof data.title === 'string' ? data.title.trim() : '',
    description: typeof data.description === 'string' ? data.description.trim() : '',
    status: normalizeStatus(data.status),
    startsAt: toDate(data.startsAt),
    endsAt: toDate(data.endsAt),
    maxNumber: clampInteger(data.maxNumber, MIN_MAX_NUMBER, MAX_MAX_NUMBER, DEFAULT_MAX_NUMBER),
    maxTicketsPerUser: clampInteger(
      data.maxTicketsPerUser,
      MIN_MAX_TICKETS_PER_USER,
      MAX_MAX_TICKETS_PER_USER,
      DEFAULT_MAX_TICKETS_PER_USER
    ),
    participantsCount: Number.isFinite(participantsRaw)
      ? Math.max(0, Math.floor(participantsRaw))
      : 0,
    winner: normalizeWinner(data.winner),
    entrySchemaVersion: Number.isFinite(entrySchemaRaw)
      ? Math.max(0, Math.floor(entrySchemaRaw))
      : 2,
    migrationStatus: normalizeMigrationStatus(data.migrationStatus),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    deletedAt: toDate(data.deletedAt)
  };
};

const normalizeEntry = (id: string, data: Record<string, unknown>): LotteryEntry => {
  const selectedFromField = parseSelectedNumber(data.selectedNumber);
  const selectedFromId = (() => {
    const match = id.match(/^n_(\d+)$/);
    if (!match) return null;
    return parseSelectedNumber(match[1]);
  })();

  return {
    id,
    userId: typeof data.userId === 'string' ? data.userId : '',
    userName: typeof data.userName === 'string' ? data.userName : 'Usuario',
    userProfilePicUrl: typeof data.userProfilePicUrl === 'string' ? data.userProfilePicUrl : '',
    lotteryId: typeof data.lotteryId === 'string' ? data.lotteryId : '',
    selectedNumber: selectedFromField || selectedFromId || 0,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt)
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

  const numberPageEntriesByLottery = ref<Record<string, Record<number, LotteryEntry[]>>>({});
  const numberPageLoadingByKey = ref<Record<string, boolean>>({});
  const allNumbersLoadedByLottery = ref<Record<string, boolean>>({});

  const userNumbersByLottery = ref<Record<string, number[]>>({});
  const userTicketsCountByLottery = ref<Record<string, number>>({});
  const userEntriesUnsubscribe = ref<Unsubscribe | null>(null);

  const selectingByKey = ref<Record<string, boolean>>({});
  const drawLoadingByLottery = ref<Record<string, boolean>>({});

  const activePublicLotteries = computed(() =>
    publicLotteries.value.filter((lottery) => lottery.status === 'active')
  );

  const getLotteryById = (lotteryId: string): Lottery | null => {
    const inPublic = publicLotteries.value.find((lottery) => lottery.id === lotteryId);
    if (inPublic) return inPublic;
    const inAdmin = adminLotteries.value.find((lottery) => lottery.id === lotteryId);
    return inAdmin || null;
  };

  const mapLotteries = (updater: (lottery: Lottery) => Lottery) => {
    publicLotteries.value = publicLotteries.value.map(updater);
    adminLotteries.value = adminLotteries.value.map(updater);
  };

  const updateLotteryById = (lotteryId: string, updater: (lottery: Lottery) => Lottery) => {
    mapLotteries((lottery) => (lottery.id === lotteryId ? updater(lottery) : lottery));
  };

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

  const clearNumberPagesForLottery = (lotteryId: string) => {
    const next = { ...numberPageEntriesByLottery.value };
    delete next[lotteryId];
    numberPageEntriesByLottery.value = next;

    const loadingNext = { ...numberPageLoadingByKey.value };
    for (const key of Object.keys(loadingNext)) {
      if (key.startsWith(`${lotteryId}:`)) {
        delete loadingNext[key];
      }
    }
    numberPageLoadingByKey.value = loadingNext;

    const loadedNext = { ...allNumbersLoadedByLottery.value };
    delete loadedNext[lotteryId];
    allNumbersLoadedByLottery.value = loadedNext;
  };

  const getNumberPageBounds = (lotteryId: string, page: number) => {
    const lottery = getLotteryById(lotteryId);
    const safeMaxNumber = lottery?.maxNumber || DEFAULT_MAX_NUMBER;
    const safePage = Math.max(1, Math.floor(page || 1));
    const totalPages = Math.max(1, Math.ceil(safeMaxNumber / NUMBER_PAGE_SIZE));
    const boundedPage = Math.min(totalPages, safePage);
    const start = (boundedPage - 1) * NUMBER_PAGE_SIZE + 1;
    const end = Math.min(safeMaxNumber, boundedPage * NUMBER_PAGE_SIZE);

    return {
      page: boundedPage,
      start,
      end,
      totalPages,
      maxNumber: safeMaxNumber
    };
  };

  const getUserNumbers = (lotteryId: string): number[] => {
    return userNumbersByLottery.value[lotteryId] || [];
  };

  const getUserTicketsCount = (lotteryId: string): number => {
    return Math.max(0, Math.floor(userTicketsCountByLottery.value[lotteryId] || 0));
  };

  const hasSelectedNumber = (lotteryId: string, selectedNumber: number): boolean => {
    return getUserNumbers(lotteryId).includes(selectedNumber);
  };

  const setUserNumbersForLottery = (lotteryId: string, numbers: number[]) => {
    const normalized = Array.from(
      new Set(
        numbers
          .map((number) => parseSelectedNumber(number))
          .filter((value): value is number => value != null)
      )
    ).sort((a, b) => a - b);

    if (normalized.length === 0) {
      const nextNumbers = { ...userNumbersByLottery.value };
      delete nextNumbers[lotteryId];
      userNumbersByLottery.value = nextNumbers;

      const nextCounts = { ...userTicketsCountByLottery.value };
      delete nextCounts[lotteryId];
      userTicketsCountByLottery.value = nextCounts;
      return;
    }

    userNumbersByLottery.value = {
      ...userNumbersByLottery.value,
      [lotteryId]: normalized
    };

    userTicketsCountByLottery.value = {
      ...userTicketsCountByLottery.value,
      [lotteryId]: normalized.length
    };
  };

  const mergeNumberIntoLottery = (lotteryId: string, selectedNumber: number) => {
    const current = getUserNumbers(lotteryId);
    if (current.includes(selectedNumber)) return;
    setUserNumbersForLottery(lotteryId, [...current, selectedNumber]);
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
          normalizeLottery(lotteryDoc.id, lotteryDoc.data() as Record<string, unknown>)
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
          normalizeLottery(lotteryDoc.id, lotteryDoc.data() as Record<string, unknown>)
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
      userNumbersByLottery.value = {};
      userTicketsCountByLottery.value = {};
      return;
    }

    const joinedQuery = query(
      collectionGroup(db, 'entries'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(USER_ENTRIES_LIMIT)
    );

    userEntriesUnsubscribe.value = onSnapshot(
      joinedQuery,
      (snapshot) => {
        const grouped: Record<string, number[]> = {};

        for (const entryDoc of snapshot.docs) {
          const data = entryDoc.data() || {};
          const lotteryId = typeof data.lotteryId === 'string'
            ? data.lotteryId
            : entryDoc.ref.parent.parent?.id || '';
          if (!lotteryId) continue;

          const selectedNumber = parseSelectedNumber(data.selectedNumber)
            || parseSelectedNumber(entryDoc.id.replace(/^n_/, ''));
          if (!selectedNumber) continue;

          if (!grouped[lotteryId]) grouped[lotteryId] = [];
          grouped[lotteryId].push(selectedNumber);
        }

        const nextNumbers: Record<string, number[]> = {};
        const nextCounts: Record<string, number> = {};
        for (const [lotteryId, numbers] of Object.entries(grouped)) {
          const normalized = Array.from(new Set(numbers)).sort((a, b) => a - b);
          nextNumbers[lotteryId] = normalized;
          nextCounts[lotteryId] = normalized.length;
        }

        userNumbersByLottery.value = nextNumbers;
        userTicketsCountByLottery.value = nextCounts;
      },
      (error) => {
        console.error('Error loading user lottery numbers:', error);
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

  const isLotteryOpenForEntry = (lottery: Lottery, nowMs: number = Date.now()): boolean => {
    if (lottery.status !== 'active') return false;
    if (lottery.winner) return false;
    if (lottery.migrationStatus === 'running') return false;
    if (lottery.startsAt && lottery.startsAt.getTime() > nowMs) return false;
    if (lottery.endsAt && lottery.endsAt.getTime() < nowMs) return false;
    return true;
  };

  const setNumberPageLoading = (lotteryId: string, page: number, value: boolean) => {
    const key = `${lotteryId}:${page}`;
    if (value) {
      numberPageLoadingByKey.value = {
        ...numberPageLoadingByKey.value,
        [key]: true
      };
      return;
    }

    const next = { ...numberPageLoadingByKey.value };
    delete next[key];
    numberPageLoadingByKey.value = next;
  };

  const isNumberPageLoading = (lotteryId: string, page: number): boolean => {
    return Boolean(numberPageLoadingByKey.value[`${lotteryId}:${Math.max(1, Math.floor(page || 1))}`]);
  };

  const setNumberPageEntries = (lotteryId: string, page: number, entries: LotteryEntry[]) => {
    const currentPages = numberPageEntriesByLottery.value[lotteryId] || {};
    numberPageEntriesByLottery.value = {
      ...numberPageEntriesByLottery.value,
      [lotteryId]: {
        ...currentPages,
        [page]: entries
      }
    };
  };

  const getNumberPageEntries = (lotteryId: string, page: number): LotteryEntry[] => {
    const safePage = Math.max(1, Math.floor(page || 1));
    return numberPageEntriesByLottery.value[lotteryId]?.[safePage] || [];
  };

  const loadNumberPage = async (
    lotteryId: string,
    page: number,
    options: { force?: boolean } = {}
  ) => {
    const bounds = getNumberPageBounds(lotteryId, page);
    const safePage = bounds.page;
    const force = Boolean(options.force);
    const lottery = getLotteryById(lotteryId);

    if (!force && getNumberPageEntries(lotteryId, safePage).length > 0) {
      return;
    }
    if (!force && allNumbersLoadedByLottery.value[lotteryId]) {
      return;
    }

    if (isNumberPageLoading(lotteryId, safePage)) return;

    setNumberPageLoading(lotteryId, safePage, true);
    try {
      const maxNumber = lottery?.maxNumber || DEFAULT_MAX_NUMBER;
      const fullLoadLimit = Math.max(1, Math.min(MAX_MAX_NUMBER, maxNumber));
      const numbersQuery = query(
        collection(db, 'lotteries', lotteryId, 'entries'),
        orderBy('selectedNumber', 'asc'),
        limit(fullLoadLimit)
      );

      const snapshot = await getDocs(numbersQuery);
      const allEntries = snapshot.docs
        .map((entryDoc) => normalizeEntry(entryDoc.id, entryDoc.data() as Record<string, unknown>))
        .filter((entry) => entry.selectedNumber > 0)
        .sort((a, b) => a.selectedNumber - b.selectedNumber);

      const nextPages: Record<number, LotteryEntry[]> = {};
      const totalPages = Math.max(1, Math.ceil(maxNumber / NUMBER_PAGE_SIZE));
      for (let currentPage = 1; currentPage <= totalPages; currentPage += 1) {
        const pageBounds = getNumberPageBounds(lotteryId, currentPage);
        nextPages[currentPage] = allEntries.filter(
          (entry) => entry.selectedNumber >= pageBounds.start && entry.selectedNumber <= pageBounds.end
        );
      }

      numberPageEntriesByLottery.value = {
        ...numberPageEntriesByLottery.value,
        [lotteryId]: nextPages
      };

      allNumbersLoadedByLottery.value = {
        ...allNumbersLoadedByLottery.value,
        [lotteryId]: true
      };
    } catch (error) {
      console.error('Error loading lottery number page:', error);
      throw error;
    } finally {
      setNumberPageLoading(lotteryId, safePage, false);
    }
  };

  const getNumberCells = (
    lotteryId: string,
    page: number,
    filter: LotteryNumberFilter = 'all'
  ): LotteryNumberCell[] => {
    const bounds = getNumberPageBounds(lotteryId, page);
    const entries = getNumberPageEntries(lotteryId, bounds.page);

    const byNumber = new Map<number, LotteryEntry>();
    for (const entry of entries) {
      if (!entry.selectedNumber) continue;
      if (!byNumber.has(entry.selectedNumber)) {
        byNumber.set(entry.selectedNumber, entry);
      }
    }

    const myNumbers = new Set(getUserNumbers(lotteryId));
    const cells: LotteryNumberCell[] = [];

    for (let number = bounds.start; number <= bounds.end; number += 1) {
      const entry = byNumber.get(number) || null;
      const isMine = myNumbers.has(number);
      const state: LotteryNumberCell['state'] = isMine
        ? 'mine'
        : entry
          ? 'sold'
          : 'available';

      if (filter === 'available' && state !== 'available') continue;
      if (filter === 'sold' && state === 'available') continue;

      cells.push({ number, entry, state });
    }

    return cells;
  };

  const setSelecting = (lotteryId: string, selectedNumber: number, value: boolean) => {
    const key = `${lotteryId}:${selectedNumber}`;
    if (value) {
      selectingByKey.value = {
        ...selectingByKey.value,
        [key]: true
      };
      return;
    }

    const next = { ...selectingByKey.value };
    delete next[key];
    selectingByKey.value = next;
  };

  const isSelectingNumber = (lotteryId: string, selectedNumber: number): boolean => {
    return Boolean(selectingByKey.value[`${lotteryId}:${selectedNumber}`]);
  };

  const isDrawingLottery = (lotteryId: string): boolean => {
    return Boolean(drawLoadingByLottery.value[lotteryId]);
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

  const setParticipantsCount = (lotteryId: string, count: number) => {
    updateLotteryById(lotteryId, (lottery) => ({
      ...lottery,
      participantsCount: Math.max(0, Math.floor(count))
    }));
  };

  const selectLotteryNumber = async (lotteryId: string, selectedNumber: number) => {
    if (!authStore.isAuthenticated || !authStore.user?.uid) {
      throw new Error('Debes iniciar sesion para participar.');
    }

    const lottery = getLotteryById(lotteryId);
    if (!lottery) {
      throw new Error('La loteria no esta disponible.');
    }

    if (!isLotteryOpenForEntry(lottery)) {
      throw new Error('Esta loteria no acepta nuevos participantes.');
    }

    const parsedSelectedNumber = parseSelectedNumber(selectedNumber);
    if (!parsedSelectedNumber || parsedSelectedNumber < 1 || parsedSelectedNumber > lottery.maxNumber) {
      throw new Error(`Debes elegir un numero entre 1 y ${lottery.maxNumber}.`);
    }

    const alreadyMine = hasSelectedNumber(lotteryId, parsedSelectedNumber);
    if (alreadyMine) {
      return {
        status: 'already_selected',
        lotteryId,
        selectedNumber: parsedSelectedNumber,
        participantsCount: lottery.participantsCount,
        userTicketsCount: getUserTicketsCount(lotteryId)
      } as EnterLotteryResponse;
    }

    const currentTicketsCount = getUserTicketsCount(lotteryId);
    if (currentTicketsCount >= lottery.maxTicketsPerUser) {
      throw new Error(`Alcanzaste el maximo de ${lottery.maxTicketsPerUser} numeros para esta loteria.`);
    }

    const page = Math.floor((parsedSelectedNumber - 1) / NUMBER_PAGE_SIZE) + 1;
    const previousParticipants = lottery.participantsCount;
    const previousNumbers = [...getUserNumbers(lotteryId)];
    const previousTicketCount = currentTicketsCount;
    const previousPageEntries = [...getNumberPageEntries(lotteryId, page)];

    const fallbackName = authStore.userProfile?.nombre?.trim()
      || authStore.user.displayName
      || authStore.user.email?.split('@')[0]
      || 'Usuario';
    const fallbackPic = authStore.userProfile?.profilePictureUrl || authStore.user.photoURL || '';

    mergeNumberIntoLottery(lotteryId, parsedSelectedNumber);
    setParticipantsCount(lotteryId, previousParticipants + 1);

    const bounds = getNumberPageBounds(lotteryId, page);
    if (parsedSelectedNumber >= bounds.start && parsedSelectedNumber <= bounds.end) {
      const existsInPage = previousPageEntries.some((entry) => entry.selectedNumber === parsedSelectedNumber);
      if (!existsInPage) {
        const optimisticEntry: LotteryEntry = {
          id: toLotteryEntryId(parsedSelectedNumber),
          userId: authStore.user.uid,
          userName: fallbackName,
          userProfilePicUrl: fallbackPic,
          lotteryId,
          selectedNumber: parsedSelectedNumber,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        setNumberPageEntries(
          lotteryId,
          page,
          [...previousPageEntries, optimisticEntry].sort((a, b) => a.selectedNumber - b.selectedNumber)
        );
      }
    }

    setSelecting(lotteryId, parsedSelectedNumber, true);
    try {
      const enterLotteryCallable = httpsCallable(functions, 'enterLottery');
      const response = await enterLotteryCallable({
        lotteryId,
        selectedNumber: parsedSelectedNumber,
        idempotencyKey: `${lotteryId}_${parsedSelectedNumber}_${Date.now()}`
      });

      const payload = (response.data || {}) as EnterLotteryResponse;
      const safeStatus = payload.status;
      const safeSelectedNumber = parseSelectedNumber(payload.selectedNumber);
      if (
        (safeStatus !== 'ok' && safeStatus !== 'already_selected') ||
        safeSelectedNumber == null ||
        safeSelectedNumber !== parsedSelectedNumber
      ) {
        throw new Error(
          'backend-outdated: La compra no pudo confirmarse. Actualiza/deploya la funcion enterLottery V2.'
        );
      }

      if (typeof payload.participantsCount === 'number') {
        setParticipantsCount(lotteryId, payload.participantsCount);
      }
      if (typeof payload.userTicketsCount === 'number') {
        userTicketsCountByLottery.value = {
          ...userTicketsCountByLottery.value,
          [lotteryId]: Math.max(0, Math.floor(payload.userTicketsCount))
        };
      }

      mergeNumberIntoLottery(lotteryId, parsedSelectedNumber);
      await loadNumberPage(lotteryId, page, { force: true });
      return {
        ...payload,
        selectedNumber: safeSelectedNumber
      };
    } catch (error: any) {
      setParticipantsCount(lotteryId, previousParticipants);
      setUserNumbersForLottery(lotteryId, previousNumbers);
      userTicketsCountByLottery.value = {
        ...userTicketsCountByLottery.value,
        [lotteryId]: previousTicketCount
      };
      setNumberPageEntries(lotteryId, page, previousPageEntries);

      const code = String(error?.code || '');
      if (code.includes('already-exists')) {
        await loadNumberPage(lotteryId, page, { force: true });
      }
      throw error;
    } finally {
      setSelecting(lotteryId, parsedSelectedNumber, false);
    }
  };

  const validateLotteryPayload = (payload: SaveLotteryPayload) => {
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

    const maxNumber = Number(payload.maxNumber);
    if (!Number.isFinite(maxNumber) || Math.floor(maxNumber) !== maxNumber) {
      throw new Error('maxNumber debe ser un entero.');
    }
    if (maxNumber < MIN_MAX_NUMBER || maxNumber > MAX_MAX_NUMBER) {
      throw new Error(`maxNumber debe estar entre ${MIN_MAX_NUMBER} y ${MAX_MAX_NUMBER}.`);
    }

    const maxTicketsPerUser = Number(payload.maxTicketsPerUser);
    if (!Number.isFinite(maxTicketsPerUser) || Math.floor(maxTicketsPerUser) !== maxTicketsPerUser) {
      throw new Error('maxTicketsPerUser debe ser un entero.');
    }
    if (maxTicketsPerUser < MIN_MAX_TICKETS_PER_USER || maxTicketsPerUser > MAX_MAX_TICKETS_PER_USER) {
      throw new Error(
        `maxTicketsPerUser debe estar entre ${MIN_MAX_TICKETS_PER_USER} y ${MAX_MAX_TICKETS_PER_USER}.`
      );
    }

    return {
      title,
      description,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      status: payload.status,
      maxNumber,
      maxTicketsPerUser
    };
  };

  const createLottery = async (payload: SaveLotteryPayload) => {
    const userId = authStore.user?.uid || 'system';
    const sanitized = validateLotteryPayload(payload);

    await addDoc(collection(db, 'lotteries'), {
      title: sanitized.title,
      description: sanitized.description,
      status: sanitized.status,
      startsAt: Timestamp.fromDate(sanitized.startsAt),
      endsAt: Timestamp.fromDate(sanitized.endsAt),
      maxNumber: sanitized.maxNumber,
      maxTicketsPerUser: sanitized.maxTicketsPerUser,
      participantsCount: 0,
      winner: null,
      entrySchemaVersion: 2,
      migrationStatus: 'done',
      createdBy: userId,
      updatedBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletedAt: null
    });
  };

  const updateLottery = async (lotteryId: string, payload: SaveLotteryPayload) => {
    const userId = authStore.user?.uid || 'system';
    const sanitized = validateLotteryPayload(payload);

    await setDoc(
      doc(db, 'lotteries', lotteryId),
      {
        title: sanitized.title,
        description: sanitized.description,
        status: sanitized.status,
        startsAt: Timestamp.fromDate(sanitized.startsAt),
        endsAt: Timestamp.fromDate(sanitized.endsAt),
        maxNumber: sanitized.maxNumber,
        maxTicketsPerUser: sanitized.maxTicketsPerUser,
        entrySchemaVersion: 2,
        migrationStatus: 'done',
        updatedBy: userId,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    clearNumberPagesForLottery(lotteryId);
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
        entrySchemaVersion: 2,
        migrationStatus: 'done',
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

    clearNumberPagesForLottery(lotteryId);
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
          selectedNumber: parseSelectedNumber(payload.winner.selectedNumber),
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
    userNumbersByLottery,
    userTicketsCountByLottery,
    initPublicLotteriesListener,
    cleanupPublicLotteries,
    initAdminLotteriesListener,
    cleanupAdminLotteries,
    initUserEntriesListener,
    getLotteryById,
    isLotteryOpenForEntry,
    getNumberPageBounds,
    loadNumberPage,
    getNumberPageEntries,
    getNumberCells,
    isNumberPageLoading,
    clearNumberPagesForLottery,
    getUserNumbers,
    getUserTicketsCount,
    hasSelectedNumber,
    isSelectingNumber,
    selectLotteryNumber,
    isDrawingLottery,
    createLottery,
    updateLottery,
    closeLottery,
    activateLottery,
    softDeleteLottery,
    setLotteryModuleEnabled,
    drawLotteryWinner,
    cleanupAll
  };
});
