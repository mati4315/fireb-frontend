import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { useAuthStore } from './authStore';

export type SurveyStatus = 'active' | 'inactive' | 'completed';

export type SurveyOption = {
  id: string;
  text: string;
  voteCount: number;
  active: boolean;
};

export type Survey = {
  id: string;
  question: string;
  description: string;
  status: SurveyStatus;
  durationMinutes: number;
  isMultipleChoice: boolean;
  maxVotesPerUser: number;
  totalVotes: number;
  options: SurveyOption[];
  createdAt: Date | null;
  updatedAt: Date | null;
  expiresAt: Date | null;
  createdBy: string;
  updatedBy: string;
};

export type SurveyEditorOption = {
  id?: string;
  text: string;
  active: boolean;
};

export type SaveSurveyPayload = {
  question: string;
  description: string;
  status: SurveyStatus;
  durationMinutes: number;
  isMultipleChoice: boolean;
  maxVotesPerUser: number;
  options: SurveyEditorOption[];
};

type SubmitVoteResponse = {
  status: 'ok' | 'already_voted';
  surveyId: string;
  optionIds: string[];
};

const PUBLIC_PAGE_SIZE = 12;
const ADMIN_PAGE_SIZE = 120;
const FEATURED_QUERY_SIZE = 6;
const DEFAULT_SURVEY_DURATION_MINUTES = 30;
const ALLOWED_SURVEY_DURATIONS = new Set([10, 30, 120, 1440]);

const normalizeStatus = (value: unknown): SurveyStatus => {
  if (value === 'active' || value === 'inactive' || value === 'completed') {
    return value;
  }
  return 'inactive';
};

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

const clampInt = (value: unknown, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(Math.floor(parsed), min), max);
};

const normalizeDurationMinutes = (value: unknown): number => {
  const parsed = clampInt(value, 10, 1440);
  if (ALLOWED_SURVEY_DURATIONS.has(parsed)) return parsed;
  return DEFAULT_SURVEY_DURATION_MINUTES;
};

const normalizeOptionIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim();
    if (!cleaned) continue;
    unique.add(cleaned);
  }
  return Array.from(unique);
};

const generateOptionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `opt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `opt_${Date.now().toString(36)}_${randomPart}`;
};

const normalizeSurveyOptions = (value: unknown): SurveyOption[] => {
  if (!Array.isArray(value)) return [];
  const normalized: SurveyOption[] = [];

  for (const rawOption of value) {
    if (!rawOption || typeof rawOption !== 'object') continue;
    const optionData = rawOption as Record<string, unknown>;

    const id = typeof optionData.id === 'string' ? optionData.id.trim() : '';
    const text = typeof optionData.text === 'string' ? optionData.text.trim() : '';
    if (!id || !text) continue;

    normalized.push({
      id,
      text,
      voteCount: clampInt(optionData.voteCount, 0, 10_000_000),
      active: optionData.active !== false
    });
  }

  return normalized;
};

const normalizeSurvey = (id: string, data: Record<string, unknown>): Survey => {
  const isMultipleChoice = Boolean(data.isMultipleChoice);
  const maxVotes = isMultipleChoice
    ? clampInt(data.maxVotesPerUser, 1, 20)
    : 1;

  return {
    id,
    question: typeof data.question === 'string' ? data.question.trim() : '',
    description: typeof data.description === 'string' ? data.description.trim() : '',
    status: normalizeStatus(data.status),
    durationMinutes: normalizeDurationMinutes(data.durationMinutes),
    isMultipleChoice,
    maxVotesPerUser: maxVotes,
    totalVotes: clampInt(data.totalVotes, 0, 10_000_000),
    options: normalizeSurveyOptions(data.options),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    expiresAt: toDate(data.expiresAt),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : ''
  };
};

const cloneSurvey = (survey: Survey): Survey => ({
  ...survey,
  options: survey.options.map((option) => ({ ...option }))
});

const mergeSurveys = (primary: Survey[], secondary: Survey[]): Survey[] => {
  const merged = new Map<string, Survey>();

  for (const survey of primary) {
    merged.set(survey.id, survey);
  }

  for (const survey of secondary) {
    if (!merged.has(survey.id)) {
      merged.set(survey.id, survey);
    }
  }

  return Array.from(merged.values());
};

const isExpired = (survey: Survey, nowMs: number = Date.now()): boolean => {
  return Boolean(survey.expiresAt && survey.expiresAt.getTime() <= nowMs);
};

const normalizeSurveyStatusForDisplay = (survey: Survey, nowMs: number = Date.now()): SurveyStatus => {
  if (survey.status === 'active' && isExpired(survey, nowMs)) return 'completed';
  return survey.status;
};

const addMinutesFromNow = (minutes: number): Date => {
  return new Date(Date.now() + (minutes * 60 * 1000));
};

export const useSurveyStore = defineStore('survey', () => {
  const authStore = useAuthStore();

  const publicLiveSurveys = ref<Survey[]>([]);
  const publicExtraSurveys = ref<Survey[]>([]);
  const publicLoading = ref(false);
  const publicLoadingMore = ref(false);
  const publicHasMore = ref(true);
  const publicCursor = ref<QueryDocumentSnapshot | null>(null);
  const publicUnsubscribe = ref<Unsubscribe | null>(null);
  const featuredLiveSurveys = ref<Survey[]>([]);
  const featuredLoading = ref(false);
  const featuredUnsubscribe = ref<Unsubscribe | null>(null);
  const featuredClockNow = ref(Date.now());
  const featuredClockTimer = ref<ReturnType<typeof setInterval> | null>(null);

  const adminSurveys = ref<Survey[]>([]);
  const adminLoading = ref(false);
  const adminUnsubscribe = ref<Unsubscribe | null>(null);

  const userVotesBySurvey = ref<Record<string, string[]>>({});
  const voteSubmittingBySurvey = ref<Record<string, boolean>>({});
  const votesUnsubscribe = ref<Unsubscribe | null>(null);

  const publicSurveys = computed(() => mergeSurveys(publicLiveSurveys.value, publicExtraSurveys.value));
  const featuredSurvey = computed<Survey | null>(() => {
    const nowMs = featuredClockNow.value;
    for (const survey of featuredLiveSurveys.value) {
      if (normalizeSurveyStatusForDisplay(survey, nowMs) === 'active') {
        return survey;
      }
    }
    return null;
  });

  const ensureFeaturedClock = () => {
    if (featuredClockTimer.value) return;
    featuredClockTimer.value = setInterval(() => {
      featuredClockNow.value = Date.now();
    }, 15_000);
  };

  const stopFeaturedClock = () => {
    if (!featuredClockTimer.value) return;
    clearInterval(featuredClockTimer.value);
    featuredClockTimer.value = null;
  };

  const mapSurveyCollections = (
    surveyId: string,
    updater: (survey: Survey) => Survey
  ) => {
    const mapList = (list: Survey[]) => {
      return list.map((item) => (item.id === surveyId ? updater(item) : item));
    };

    publicLiveSurveys.value = mapList(publicLiveSurveys.value);
    publicExtraSurveys.value = mapList(publicExtraSurveys.value);
    featuredLiveSurveys.value = mapList(featuredLiveSurveys.value);
    adminSurveys.value = mapList(adminSurveys.value);
  };

  const replaceSurveyInCollections = (surveyId: string, replacement: Survey) => {
    mapSurveyCollections(surveyId, () => cloneSurvey(replacement));
  };

  const findSurveyById = (surveyId: string): Survey | null => {
    const inPublic = publicSurveys.value.find((item) => item.id === surveyId);
    if (inPublic) return inPublic;
    const inFeatured = featuredLiveSurveys.value.find((item) => item.id === surveyId);
    if (inFeatured) return inFeatured;
    const inAdmin = adminSurveys.value.find((item) => item.id === surveyId);
    return inAdmin || null;
  };

  const initPublicSurveysListener = () => {
    if (publicUnsubscribe.value) return;

    publicLoading.value = true;
    publicExtraSurveys.value = [];

    const surveysQuery = query(
      collection(db, 'surveys'),
      where('status', 'in', ['active', 'completed']),
      orderBy('createdAt', 'desc'),
      limit(PUBLIC_PAGE_SIZE)
    );

    publicUnsubscribe.value = onSnapshot(
      surveysQuery,
      (snapshot) => {
        publicLiveSurveys.value = snapshot.docs.map((surveyDoc) =>
          normalizeSurvey(surveyDoc.id, surveyDoc.data())
        );
        publicCursor.value = snapshot.docs.length > 0
          ? snapshot.docs[snapshot.docs.length - 1]
          : null;
        publicHasMore.value = snapshot.size >= PUBLIC_PAGE_SIZE;
        publicLoading.value = false;
      },
      (error) => {
        console.error('Error loading surveys:', error);
        publicLoading.value = false;
      }
    );
  };

  const cleanupPublicSurveys = () => {
    if (publicUnsubscribe.value) {
      publicUnsubscribe.value();
      publicUnsubscribe.value = null;
    }
  };

  const initFeaturedSurveyListener = () => {
    if (featuredUnsubscribe.value) return;

    featuredLoading.value = true;
    ensureFeaturedClock();

    const surveysQuery = query(
      collection(db, 'surveys'),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc'),
      limit(FEATURED_QUERY_SIZE)
    );

    featuredUnsubscribe.value = onSnapshot(
      surveysQuery,
      (snapshot) => {
        featuredLiveSurveys.value = snapshot.docs.map((surveyDoc) =>
          normalizeSurvey(surveyDoc.id, surveyDoc.data())
        );
        featuredLoading.value = false;
      },
      (error) => {
        console.error('Error loading featured survey:', error);
        featuredLoading.value = false;
      }
    );
  };

  const cleanupFeaturedSurvey = () => {
    if (featuredUnsubscribe.value) {
      featuredUnsubscribe.value();
      featuredUnsubscribe.value = null;
    }
    featuredLiveSurveys.value = [];
    featuredLoading.value = false;
    stopFeaturedClock();
  };

  const loadMorePublicSurveys = async () => {
    if (!publicHasMore.value || publicLoadingMore.value || !publicCursor.value) return;

    publicLoadingMore.value = true;
    try {
      const surveysQuery = query(
        collection(db, 'surveys'),
        where('status', 'in', ['active', 'completed']),
        orderBy('createdAt', 'desc'),
        startAfter(publicCursor.value),
        limit(PUBLIC_PAGE_SIZE)
      );

      const snapshot = await getDocs(surveysQuery);
      const existingIds = new Set(publicSurveys.value.map((item) => item.id));
      const nextBatch: Survey[] = [];

      for (const surveyDoc of snapshot.docs) {
        if (existingIds.has(surveyDoc.id)) continue;
        nextBatch.push(normalizeSurvey(surveyDoc.id, surveyDoc.data()));
      }

      publicExtraSurveys.value = [...publicExtraSurveys.value, ...nextBatch];
      publicCursor.value = snapshot.docs.length > 0
        ? snapshot.docs[snapshot.docs.length - 1]
        : publicCursor.value;
      publicHasMore.value = snapshot.size >= PUBLIC_PAGE_SIZE;
    } catch (error) {
      console.error('Error loading more surveys:', error);
    } finally {
      publicLoadingMore.value = false;
    }
  };

  const initAdminSurveysListener = () => {
    if (adminUnsubscribe.value) return;

    adminLoading.value = true;
    const surveysQuery = query(
      collection(db, 'surveys'),
      orderBy('createdAt', 'desc'),
      limit(ADMIN_PAGE_SIZE)
    );

    adminUnsubscribe.value = onSnapshot(
      surveysQuery,
      (snapshot) => {
        adminSurveys.value = snapshot.docs.map((surveyDoc) =>
          normalizeSurvey(surveyDoc.id, surveyDoc.data())
        );
        adminLoading.value = false;
      },
      (error) => {
        console.error('Error loading admin surveys:', error);
        adminLoading.value = false;
      }
    );
  };

  const cleanupAdminSurveys = () => {
    if (adminUnsubscribe.value) {
      adminUnsubscribe.value();
      adminUnsubscribe.value = null;
    }
  };

  const cleanupVotesListener = () => {
    if (votesUnsubscribe.value) {
      votesUnsubscribe.value();
      votesUnsubscribe.value = null;
    }
  };

  const initUserVotesListener = () => {
    cleanupVotesListener();

    const currentUserId = authStore.user?.uid;
    if (!currentUserId) {
      userVotesBySurvey.value = {};
      return;
    }

    const votesQuery = query(
      collection(db, 'survey_votes'),
      where('userId', '==', currentUserId),
      orderBy('createdAt', 'desc'),
      limit(300)
    );

    votesUnsubscribe.value = onSnapshot(
      votesQuery,
      (snapshot) => {
        const nextVotes: Record<string, string[]> = {};

        for (const voteDoc of snapshot.docs) {
          const voteData = voteDoc.data() as Record<string, unknown>;
          const surveyId = typeof voteData.surveyId === 'string' ? voteData.surveyId : '';
          if (!surveyId) continue;
          nextVotes[surveyId] = normalizeOptionIds(voteData.optionIds);
        }

        userVotesBySurvey.value = nextVotes;
      },
      (error) => {
        console.error('Error loading user survey votes:', error);
      }
    );
  };

  watch(
    () => authStore.user?.uid,
    () => {
      initUserVotesListener();
    },
    { immediate: true }
  );

  const getUserVoteOptionIds = (surveyId: string): string[] => {
    return userVotesBySurvey.value[surveyId] || [];
  };

  const hasUserVoted = (surveyId: string): boolean => {
    return getUserVoteOptionIds(surveyId).length > 0;
  };

  const isSurveyVotable = (survey: Survey): boolean => {
    return normalizeSurveyStatusForDisplay(survey) === 'active';
  };

  const isVoteSubmitting = (surveyId: string): boolean => {
    return Boolean(voteSubmittingBySurvey.value[surveyId]);
  };

  const setVoteSubmitting = (surveyId: string, value: boolean) => {
    if (value) {
      voteSubmittingBySurvey.value = {
        ...voteSubmittingBySurvey.value,
        [surveyId]: true
      };
      return;
    }

    const next = { ...voteSubmittingBySurvey.value };
    delete next[surveyId];
    voteSubmittingBySurvey.value = next;
  };

  const submitVote = async (surveyId: string, rawOptionIds: string[]) => {
    if (!authStore.isAuthenticated) {
      throw new Error('Debes iniciar sesion para votar.');
    }

    const survey = findSurveyById(surveyId);
    if (!survey) {
      throw new Error('No se encontro la encuesta.');
    }
    if (!isSurveyVotable(survey)) {
      throw new Error('La encuesta no esta disponible para votar.');
    }
    if (hasUserVoted(surveyId)) {
      return { status: 'already_voted', surveyId, optionIds: getUserVoteOptionIds(surveyId) };
    }

    const optionIds = normalizeOptionIds(rawOptionIds);
    if (optionIds.length === 0) {
      throw new Error('Debes seleccionar al menos una opcion.');
    }
    if (!survey.isMultipleChoice && optionIds.length !== 1) {
      throw new Error('Esta encuesta permite solo una opcion.');
    }
    if (optionIds.length > survey.maxVotesPerUser) {
      throw new Error('Superaste el maximo de opciones permitidas.');
    }

    const activeOptionIds = new Set(
      survey.options.filter((option) => option.active).map((option) => option.id)
    );
    for (const optionId of optionIds) {
      if (!activeOptionIds.has(optionId)) {
        throw new Error('Una opcion seleccionada no es valida.');
      }
    }

    const previousSurvey = cloneSurvey(survey);
    const previousVote = userVotesBySurvey.value[surveyId]
      ? [...userVotesBySurvey.value[surveyId]]
      : null;

    // Optimistic UI
    userVotesBySurvey.value = {
      ...userVotesBySurvey.value,
      [surveyId]: optionIds
    };

    const optionCountMap = new Map<string, number>();
    for (const optionId of optionIds) {
      optionCountMap.set(optionId, (optionCountMap.get(optionId) || 0) + 1);
    }

    mapSurveyCollections(surveyId, (currentSurvey) => {
      const nextSurvey = cloneSurvey(currentSurvey);
      nextSurvey.totalVotes += optionIds.length;
      nextSurvey.options = nextSurvey.options.map((option) => {
        const incrementBy = optionCountMap.get(option.id) || 0;
        if (incrementBy <= 0) return option;
        return {
          ...option,
          voteCount: option.voteCount + incrementBy
        };
      });
      return nextSurvey;
    });

    setVoteSubmitting(surveyId, true);
    try {
      const submitVoteCallable = httpsCallable(functions, 'submitSurveyVote');
      const response = await submitVoteCallable({
        surveyId,
        optionIds,
        idempotencyKey: `${surveyId}_${Date.now()}`
      });

      const payload = (response.data || {}) as SubmitVoteResponse;
      if (payload.status === 'already_voted') {
        replaceSurveyInCollections(surveyId, previousSurvey);
        userVotesBySurvey.value = {
          ...userVotesBySurvey.value,
          [surveyId]: normalizeOptionIds(payload.optionIds)
        };
      }

      return payload;
    } catch (error) {
      replaceSurveyInCollections(surveyId, previousSurvey);
      if (previousVote) {
        userVotesBySurvey.value = {
          ...userVotesBySurvey.value,
          [surveyId]: previousVote
        };
      } else {
        const nextVotes = { ...userVotesBySurvey.value };
        delete nextVotes[surveyId];
        userVotesBySurvey.value = nextVotes;
      }
      throw error;
    } finally {
      setVoteSubmitting(surveyId, false);
    }
  };

  const toPersistedOptions = (
    formOptions: SurveyEditorOption[],
    existingOptions: SurveyOption[],
    hasVotes: boolean
  ): SurveyOption[] => {
    const existingById = new Map(existingOptions.map((option) => [option.id, option]));
    const usedIds = new Set<string>();
    const nextOptions: SurveyOption[] = [];

    for (const formOption of formOptions) {
      const incomingId = typeof formOption.id === 'string' ? formOption.id.trim() : '';
      const text = formOption.text.trim();
      const active = formOption.active !== false;

      if (incomingId && existingById.has(incomingId)) {
        const existing = existingById.get(incomingId)!;
        nextOptions.push({
          id: existing.id,
          text: hasVotes ? existing.text : (text || existing.text),
          voteCount: existing.voteCount,
          active
        });
        usedIds.add(existing.id);
        continue;
      }

      if (!text) continue;

      let nextId = incomingId || generateOptionId();
      while (usedIds.has(nextId) || existingById.has(nextId)) {
        nextId = generateOptionId();
      }
      usedIds.add(nextId);

      nextOptions.push({
        id: nextId,
        text,
        voteCount: 0,
        active
      });
    }

    if (hasVotes) {
      for (const oldOption of existingOptions) {
        if (usedIds.has(oldOption.id)) continue;
        nextOptions.push({
          ...oldOption,
          active: false
        });
      }
    }

    return nextOptions;
  };

  const resolveDurationMinutesFromPayload = (value: unknown): number => {
    return normalizeDurationMinutes(value);
  };

  const createSurvey = async (payload: SaveSurveyPayload) => {
    const currentUserId = authStore.user?.uid || 'system';
    const question = payload.question.trim();
    const description = payload.description.trim();
    const status = normalizeStatus(payload.status);
    const durationMinutes = resolveDurationMinutesFromPayload(payload.durationMinutes);
    const isMultipleChoice = Boolean(payload.isMultipleChoice);
    const maxVotesPerUser = isMultipleChoice
      ? clampInt(payload.maxVotesPerUser, 1, 20)
      : 1;
    const options = toPersistedOptions(payload.options, [], false);

    if (!question) throw new Error('La pregunta es obligatoria.');
    if (options.length < 2) throw new Error('Debes cargar al menos 2 opciones.');

    const activeOptionsCount = options.filter((option) => option.active).length;
    if (activeOptionsCount < 2) {
      throw new Error('Debes dejar al menos 2 opciones activas.');
    }

    await addDoc(collection(db, 'surveys'), {
      question,
      description,
      status,
      durationMinutes,
      isMultipleChoice,
      maxVotesPerUser,
      options,
      totalVotes: 0,
      createdBy: currentUserId,
      updatedBy: currentUserId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(addMinutesFromNow(durationMinutes))
    });
  };

  const updateSurvey = async (surveyId: string, payload: SaveSurveyPayload) => {
    const surveyRef = doc(db, 'surveys', surveyId);
    const currentUserId = authStore.user?.uid || 'system';
    const surveySnap = await getDoc(surveyRef);
    if (!surveySnap.exists()) {
      throw new Error('La encuesta ya no existe.');
    }

    const existingSurvey = normalizeSurvey(surveySnap.id, surveySnap.data());
    const hasVotes = existingSurvey.totalVotes > 0;
    const question = payload.question.trim();
    const description = payload.description.trim();
    const status = normalizeStatus(payload.status);
    const durationMinutes = resolveDurationMinutesFromPayload(payload.durationMinutes);
    const isMultipleChoice = Boolean(payload.isMultipleChoice);
    const maxVotesPerUser = isMultipleChoice
      ? clampInt(payload.maxVotesPerUser, 1, 20)
      : 1;

    const options = toPersistedOptions(payload.options, existingSurvey.options, hasVotes);
    if (!question) throw new Error('La pregunta es obligatoria.');
    if (options.length < 2) throw new Error('Debes conservar al menos 2 opciones.');

    const activeOptionsCount = options.filter((option) => option.active).length;
    if (activeOptionsCount < 2) {
      throw new Error('Debes dejar al menos 2 opciones activas.');
    }

    const previousDurationMinutes = resolveDurationMinutesFromPayload(existingSurvey.durationMinutes);
    const durationChanged = durationMinutes !== previousDurationMinutes;
    const nextExpiresAt = durationChanged
      ? Timestamp.fromDate(addMinutesFromNow(durationMinutes))
      : existingSurvey.expiresAt
        ? Timestamp.fromDate(existingSurvey.expiresAt)
        : Timestamp.fromDate(addMinutesFromNow(durationMinutes));

    await setDoc(
      surveyRef,
      {
        question,
        description,
        status,
        durationMinutes,
        isMultipleChoice,
        maxVotesPerUser,
        options,
        totalVotes: hasVotes
          ? existingSurvey.totalVotes
          : options.reduce((acc, option) => acc + option.voteCount, 0),
        updatedBy: currentUserId,
        updatedAt: serverTimestamp(),
        expiresAt: nextExpiresAt
      },
      { merge: true }
    );
  };

  const deleteSurvey = async (surveyId: string) => {
    await deleteDoc(doc(db, 'surveys', surveyId));
  };

  const setSurveysModuleEnabled = async (enabled: boolean) => {
    await setDoc(
      doc(db, '_config', 'modules'),
      {
        surveys: {
          enabled: Boolean(enabled)
        }
      },
      { merge: true }
    );
  };

  const cleanupAll = () => {
    cleanupPublicSurveys();
    cleanupFeaturedSurvey();
    cleanupAdminSurveys();
    cleanupVotesListener();
  };

  return {
    publicSurveys,
    publicLoading,
    publicLoadingMore,
    publicHasMore,
    featuredSurvey,
    featuredLoading,
    adminSurveys,
    adminLoading,
    userVotesBySurvey,
    normalizeSurveyStatusForDisplay,
    isSurveyVotable,
    isVoteSubmitting,
    hasUserVoted,
    getUserVoteOptionIds,
    initPublicSurveysListener,
    cleanupPublicSurveys,
    initFeaturedSurveyListener,
    cleanupFeaturedSurvey,
    loadMorePublicSurveys,
    initAdminSurveysListener,
    cleanupAdminSurveys,
    initUserVotesListener,
    submitVote,
    createSurvey,
    updateSurvey,
    deleteSurvey,
    setSurveysModuleEnabled,
    cleanupAll
  };
});
