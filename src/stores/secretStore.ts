import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions as firebaseFunctions } from '@/config/firebase';
import { useModuleStore } from './moduleStore';

export type SecretTrend = 'up' | 'down' | 'stable';

export type SecretSex = 'no_responder' | 'hombre' | 'mujer';
export type SecretCategory =
  | ''
  | 'rumores'
  | 'relaciones'
  | 'trabajo_negocios'
  | 'denuncia_light'
  | 'random_divertido';

export interface SecretRecord {
  id: string;
  descripcion: string;
  category: SecretCategory;
  zone: string;
  sex: SecretSex;
  age: number | null;
  anonAlias: string;
  stats: {
    upVotesCount: number;
    downVotesCount: number;
    commentsCount: number;
    reportsCount: number;
    totalVotesCount: number;
  };
  rank: {
    score: number;
    hotScore: number;
    controversyScore: number;
    trend: SecretTrend;
  };
  moderation: {
    status: string;
  };
  createdAt: any;
  updatedAt: any;
  deletedAt: any;
  myVote: -1 | 0 | 1;
  reportedByMe: boolean;
}

export interface SecretCommentRecord {
  id: string;
  text: string;
  anonAlias: string;
  score: number;
  reportsCount: number;
  createdAt: any;
  updatedAt: any;
  deletedAt: any;
}

export interface SecretRankingItem {
  secretId: string;
  textPreview: string;
  category: string;
  zone: string;
  createdAtMs: number;
  commentsCount: number;
  totalVotesCount: number;
  hotScore: number;
  controversyScore: number;
  trend: SecretTrend;
}

export interface SecretRankingsSnapshot {
  generatedAtMs: number;
  topDay: SecretRankingItem[];
  mostCommented: SecretRankingItem[];
  mostVoted: SecretRankingItem[];
  mostPolemic: SecretRankingItem[];
}

const SECRET_FEED_LIMIT = 120;
const SECRET_COMMENT_LIMIT = 80;
const SECRET_ANON_CLIENT_KEY = 'cdelu_secret_anon_id_v1';
const SECRET_RANKING_LIST_LIMIT = 24;

const EMPTY_SECRET_RANKINGS: SecretRankingsSnapshot = {
  generatedAtMs: 0,
  topDay: [],
  mostCommented: [],
  mostVoted: [],
  mostPolemic: []
};

const clampInt = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

const sanitizeString = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const ensureClientAnonId = (): string => {
  const fallback = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  if (typeof window === 'undefined') return fallback;

  try {
    const existing = window.localStorage.getItem(SECRET_ANON_CLIENT_KEY) || '';
    const sanitizedExisting = existing.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
    if (sanitizedExisting) return sanitizedExisting;

    const nextId = fallback.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
    window.localStorage.setItem(SECRET_ANON_CLIENT_KEY, nextId);
    return nextId;
  } catch {
    return fallback;
  }
};

const mapSecretData = (secretId: string, data: DocumentData): SecretRecord => {
  return {
    id: secretId,
    descripcion: sanitizeString(data.descripcion, 4000),
    category: (sanitizeString(data.category, 40) as SecretCategory) || '',
    zone: sanitizeString(data.zone, 80),
    sex: (sanitizeString(data.sex, 20) as SecretSex) || 'no_responder',
    age: Number.isFinite(Number(data.age)) ? Number(data.age) : null,
    anonAlias: sanitizeString(data.anonAlias, 40) || 'Anonimo',
    stats: {
      upVotesCount: clampInt(data?.stats?.upVotesCount, 0),
      downVotesCount: clampInt(data?.stats?.downVotesCount, 0),
      commentsCount: clampInt(data?.stats?.commentsCount, 0),
      reportsCount: clampInt(data?.stats?.reportsCount, 0),
      totalVotesCount: clampInt(
        data?.stats?.totalVotesCount,
        clampInt(data?.stats?.upVotesCount, 0) + clampInt(data?.stats?.downVotesCount, 0)
      )
    },
    rank: {
      score: Number(data?.rank?.score || 0),
      hotScore: Number(data?.rank?.hotScore || 0),
      controversyScore: Number(data?.rank?.controversyScore || 0),
      trend: (sanitizeString(data?.rank?.trend, 20) as SecretTrend) || 'stable'
    },
    moderation: {
      status: sanitizeString(data?.moderation?.status, 40) || 'active'
    },
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    deletedAt: data.deletedAt || null,
    myVote: 0,
    reportedByMe: false
  };
};

const mapSecretDoc = (secretDoc: QueryDocumentSnapshot<DocumentData>): SecretRecord =>
  mapSecretData(secretDoc.id, secretDoc.data() || {});

const mapSecretCommentDoc = (
  commentDoc: QueryDocumentSnapshot<DocumentData>
): SecretCommentRecord => {
  const data = commentDoc.data() || {};
  return {
    id: commentDoc.id,
    text: sanitizeString(data.text, 1000),
    anonAlias: sanitizeString(data.anonAlias, 40) || 'Anonimo',
    score: Number(data.score || 0),
    reportsCount: clampInt(data.reportsCount, 0),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    deletedAt: data.deletedAt || null
  };
};

const normalizeTrend = (value: unknown): SecretTrend => {
  const normalized = sanitizeString(value, 20).toLowerCase();
  if (normalized === 'up' || normalized === 'down' || normalized === 'stable') {
    return normalized;
  }
  return 'stable';
};

const mapSecretRankingItem = (item: any): SecretRankingItem | null => {
  const secretId = sanitizeString(item?.secretId, 128);
  if (!secretId) return null;

  return {
    secretId,
    textPreview: sanitizeString(item?.textPreview, 280),
    category: sanitizeString(item?.category, 40),
    zone: sanitizeString(item?.zone, 60),
    createdAtMs: Math.max(0, Math.floor(Number(item?.createdAtMs || 0))),
    commentsCount: clampInt(item?.commentsCount, 0),
    totalVotesCount: clampInt(item?.totalVotesCount, 0),
    hotScore: Number.isFinite(Number(item?.hotScore)) ? Number(item?.hotScore) : 0,
    controversyScore: Number.isFinite(Number(item?.controversyScore))
      ? Number(item?.controversyScore)
      : 0,
    trend: normalizeTrend(item?.trend)
  };
};

const mapSecretRankingList = (value: unknown): SecretRankingItem[] => {
  if (!Array.isArray(value)) return [];

  const items: SecretRankingItem[] = [];
  for (const rawItem of value) {
    const item = mapSecretRankingItem(rawItem);
    if (!item) continue;
    items.push(item);
    if (items.length >= SECRET_RANKING_LIST_LIMIT) break;
  }
  return items;
};

const mapSecretRankingsSnapshot = (raw: any): SecretRankingsSnapshot => {
  const lists = raw?.lists || {};

  return {
    generatedAtMs: Math.max(0, Math.floor(Number(raw?.generatedAtMs || 0))),
    topDay: mapSecretRankingList(lists?.topDay),
    mostCommented: mapSecretRankingList(lists?.mostCommented),
    mostVoted: mapSecretRankingList(lists?.mostVoted),
    mostPolemic: mapSecretRankingList(lists?.mostPolemic)
  };
};

const isSecretVisible = (secret: SecretRecord): boolean => {
  if (secret.deletedAt != null) return false;
  if (secret.moderation.status && secret.moderation.status !== 'active') return false;
  return true;
};

type CreateSecretCallableInput = {
  text: string;
  sex: SecretSex;
  age: number | null;
  category: SecretCategory | null;
  zone: string | null;
  clientAnonId: string;
};

type CreateSecretCallableResponse = {
  status: 'ok';
  secretId: string;
  anonAlias: string;
};

type VoteSecretCallableInput = {
  secretId: string;
  vote: 1 | -1;
  clientAnonId: string;
};

type VoteSecretCallableResponse = {
  status: 'ok';
  secretId: string;
  vote: 1 | -1;
  upVotesCount?: number;
  downVotesCount?: number;
  score?: number;
  trend?: SecretTrend;
};

type CreateSecretCommentCallableInput = {
  secretId: string;
  text: string;
  clientAnonId: string;
};

type CreateSecretCommentCallableResponse = {
  status: 'ok';
  secretId: string;
  commentId: string;
};

type ReportSecretCallableInput = {
  secretId: string;
  reason: string;
  clientAnonId: string;
};

type ReportSecretCallableResponse = {
  status: 'ok' | 'already_reported';
  secretId: string;
  reportsCount?: number;
  moderationStatus?: string;
};

export const useSecretStore = defineStore('secret', () => {
  const moduleStore = useModuleStore();

  const secrets = ref<SecretRecord[]>([]);
  const rankings = ref<SecretRankingsSnapshot>(EMPTY_SECRET_RANKINGS);
  const loading = ref(false);
  const rankingsLoading = ref(false);
  const error = ref<string | null>(null);
  const unsubscribeSecrets = ref<Unsubscribe | null>(null);
  const unsubscribeRankings = ref<Unsubscribe | null>(null);
  const votePendingBySecret = ref<Record<string, boolean>>({});
  const reportPendingBySecret = ref<Record<string, boolean>>({});
  const commentsBySecret = ref<Record<string, SecretCommentRecord[]>>({});
  const commentsLoadingBySecret = ref<Record<string, boolean>>({});
  const commentCreatingBySecret = ref<Record<string, boolean>>({});

  const setVotePending = (secretId: string, pending: boolean) => {
    votePendingBySecret.value = {
      ...votePendingBySecret.value,
      [secretId]: pending
    };
  };

  const setReportPending = (secretId: string, pending: boolean) => {
    reportPendingBySecret.value = {
      ...reportPendingBySecret.value,
      [secretId]: pending
    };
  };

  const setCommentsLoading = (secretId: string, value: boolean) => {
    commentsLoadingBySecret.value = {
      ...commentsLoadingBySecret.value,
      [secretId]: value
    };
  };

  const setCommentCreating = (secretId: string, value: boolean) => {
    commentCreatingBySecret.value = {
      ...commentCreatingBySecret.value,
      [secretId]: value
    };
  };

  const patchSecretLocal = (
    secretId: string,
    patcher: (secret: SecretRecord) => SecretRecord
  ) => {
    secrets.value = secrets.value.map((secret) =>
      secret.id === secretId ? patcher(secret) : secret
    );
  };

  const initSecretsListener = () => {
    if (unsubscribeSecrets.value) return;
    if (!moduleStore.modules.secrets.enabled) {
      secrets.value = [];
      loading.value = false;
      return;
    }

    loading.value = true;
    error.value = null;

    const secretsQuery = query(
      collection(db, 'content'),
      where('deletedAt', '==', null),
      where('module', '==', 'secrets'),
      where('moderation.status', '==', 'active'),
      orderBy('createdAt', 'desc'),
      limit(SECRET_FEED_LIMIT)
    );

    unsubscribeSecrets.value = onSnapshot(
      secretsQuery,
      (snapshot) => {
        const nextSecrets = snapshot.docs
          .map(mapSecretDoc)
          .filter(isSecretVisible);

        const previousById = new Map(secrets.value.map((secret) => [secret.id, secret]));
        secrets.value = nextSecrets.map((secret) => {
          const previous = previousById.get(secret.id);
          if (!previous) return secret;
          return {
            ...secret,
            myVote: previous.myVote,
            reportedByMe: previous.reportedByMe
          };
        });
        loading.value = false;
      },
      (err) => {
        console.error('Error loading secretos:', err);
        error.value = err instanceof Error ? err.message : 'No se pudo cargar secretos.';
        loading.value = false;
      }
    );
  };

  const initRankingsListener = () => {
    if (unsubscribeRankings.value) return;
    if (!moduleStore.modules.secrets.enabled) {
      rankings.value = EMPTY_SECRET_RANKINGS;
      rankingsLoading.value = false;
      return;
    }

    rankingsLoading.value = true;
    const rankingsRef = doc(db, '_config', 'secret_rankings');
    unsubscribeRankings.value = onSnapshot(
      rankingsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          rankings.value = EMPTY_SECRET_RANKINGS;
          rankingsLoading.value = false;
          return;
        }
        rankings.value = mapSecretRankingsSnapshot(snapshot.data() || {});
        rankingsLoading.value = false;
      },
      (err) => {
        console.error('Error loading secret rankings:', err);
        rankings.value = EMPTY_SECRET_RANKINGS;
        rankingsLoading.value = false;
      }
    );
  };

  const cleanup = () => {
    if (unsubscribeSecrets.value) {
      unsubscribeSecrets.value();
      unsubscribeSecrets.value = null;
    }
    if (unsubscribeRankings.value) {
      unsubscribeRankings.value();
      unsubscribeRankings.value = null;
    }
  };

  const createSecret = async (input: {
    text: string;
    sex: SecretSex;
    age: number | null;
    category: SecretCategory;
    zone: string;
  }) => {
    const callable = httpsCallable<CreateSecretCallableInput, CreateSecretCallableResponse>(
      firebaseFunctions,
      'createSecretCallable'
    );
    const payload: CreateSecretCallableInput = {
      text: input.text,
      sex: input.sex,
      age: input.age,
      category: input.category || null,
      zone: input.zone.trim() ? input.zone.trim() : null,
      clientAnonId: ensureClientAnonId()
    };
    await callable(payload);
  };

  const loadSecretById = async (secretId: string): Promise<SecretRecord | null> => {
    const normalizedSecretId = sanitizeString(secretId, 128);
    if (!normalizedSecretId) return null;

    const existing = secrets.value.find((secret) => secret.id === normalizedSecretId);
    if (existing) return existing;

    try {
      const secretSnap = await getDoc(doc(db, 'content', normalizedSecretId));
      if (!secretSnap.exists()) return null;
      const secretData = secretSnap.data() || {};
      if (secretData.module !== 'secrets') return null;

      const mapped = mapSecretData(secretSnap.id, secretData);
      if (!isSecretVisible(mapped)) return null;

      secrets.value = [mapped, ...secrets.value];
      return mapped;
    } catch (err) {
      console.error('Error loading secret by id:', err);
      return null;
    }
  };

  const voteSecret = async (secretId: string, vote: 1 | -1) => {
    if (!secretId) return;
    if (votePendingBySecret.value[secretId]) return;

    const currentSecret = secrets.value.find((secret) => secret.id === secretId);
    const previousVote = currentSecret?.myVote || 0;
    const previousUp = currentSecret?.stats.upVotesCount || 0;
    const previousDown = currentSecret?.stats.downVotesCount || 0;

    patchSecretLocal(secretId, (secret) => {
      let nextUp = secret.stats.upVotesCount;
      let nextDown = secret.stats.downVotesCount;

      if (secret.myVote === 1) nextUp = Math.max(0, nextUp - 1);
      if (secret.myVote === -1) nextDown = Math.max(0, nextDown - 1);
      if (vote === 1) nextUp += 1;
      if (vote === -1) nextDown += 1;

      return {
        ...secret,
        myVote: vote,
        stats: {
          ...secret.stats,
          upVotesCount: nextUp,
          downVotesCount: nextDown,
          totalVotesCount: nextUp + nextDown
        }
      };
    });

    setVotePending(secretId, true);
    try {
      const callable = httpsCallable<VoteSecretCallableInput, VoteSecretCallableResponse>(
        firebaseFunctions,
        'voteSecretCallable'
      );
      const result = await callable({
        secretId,
        vote,
        clientAnonId: ensureClientAnonId()
      });

      const data = result.data;
      patchSecretLocal(secretId, (secret) => ({
        ...secret,
        myVote: vote,
        stats: {
          ...secret.stats,
          upVotesCount: Number.isFinite(Number(data?.upVotesCount))
            ? Number(data?.upVotesCount)
            : secret.stats.upVotesCount,
          downVotesCount: Number.isFinite(Number(data?.downVotesCount))
            ? Number(data?.downVotesCount)
            : secret.stats.downVotesCount,
          totalVotesCount:
            (Number.isFinite(Number(data?.upVotesCount))
              ? Number(data?.upVotesCount)
              : secret.stats.upVotesCount) +
            (Number.isFinite(Number(data?.downVotesCount))
              ? Number(data?.downVotesCount)
              : secret.stats.downVotesCount)
        },
        rank: {
          ...secret.rank,
          score: Number.isFinite(Number(data?.score)) ? Number(data?.score) : secret.rank.score,
          trend: (data?.trend as SecretTrend) || secret.rank.trend
        }
      }));
    } catch (err) {
      patchSecretLocal(secretId, (secret) => ({
        ...secret,
        myVote: previousVote,
        stats: {
          ...secret.stats,
          upVotesCount: previousUp,
          downVotesCount: previousDown,
          totalVotesCount: previousUp + previousDown
        }
      }));
      throw err;
    } finally {
      setVotePending(secretId, false);
    }
  };

  const reportSecret = async (secretId: string, reason: string) => {
    if (!secretId) return;
    if (reportPendingBySecret.value[secretId]) return;
    setReportPending(secretId, true);
    try {
      const callable = httpsCallable<ReportSecretCallableInput, ReportSecretCallableResponse>(
        firebaseFunctions,
        'reportSecretCallable'
      );
      const result = await callable({
        secretId,
        reason,
        clientAnonId: ensureClientAnonId()
      });
      patchSecretLocal(secretId, (secret) => ({
        ...secret,
        reportedByMe: true,
        stats: {
          ...secret.stats,
          reportsCount: Number.isFinite(Number(result.data?.reportsCount))
            ? Number(result.data?.reportsCount)
            : secret.stats.reportsCount
        },
        moderation: {
          ...secret.moderation,
          status: result.data?.moderationStatus || secret.moderation.status
        }
      }));
    } finally {
      setReportPending(secretId, false);
    }
  };

  const loadComments = async (secretId: string) => {
    if (!secretId) return;
    if (commentsLoadingBySecret.value[secretId]) return;
    setCommentsLoading(secretId, true);
    try {
      const commentsQuery = query(
        collection(db, 'content', secretId, 'secret_comments'),
        orderBy('createdAt', 'desc'),
        limit(SECRET_COMMENT_LIMIT)
      );
      const snapshot = await getDocs(commentsQuery);
      commentsBySecret.value = {
        ...commentsBySecret.value,
        [secretId]: snapshot.docs
          .map(mapSecretCommentDoc)
          .filter((comment) => comment.deletedAt == null)
      };
    } catch (err) {
      console.error('Error loading secret comments:', err);
    } finally {
      setCommentsLoading(secretId, false);
    }
  };

  const createComment = async (secretId: string, text: string) => {
    if (!secretId) return;
    if (commentCreatingBySecret.value[secretId]) return;
    setCommentCreating(secretId, true);
    try {
      const callable = httpsCallable<
        CreateSecretCommentCallableInput,
        CreateSecretCommentCallableResponse
      >(firebaseFunctions, 'createSecretCommentCallable');
      await callable({
        secretId,
        text,
        clientAnonId: ensureClientAnonId()
      });
      await loadComments(secretId);
    } finally {
      setCommentCreating(secretId, false);
    }
  };

  const getComments = (secretId: string): SecretCommentRecord[] =>
    commentsBySecret.value[secretId] || [];

  const isVotingPending = (secretId: string): boolean =>
    Boolean(votePendingBySecret.value[secretId]);

  const isReportPending = (secretId: string): boolean =>
    Boolean(reportPendingBySecret.value[secretId]);

  const isCommentsLoading = (secretId: string): boolean =>
    Boolean(commentsLoadingBySecret.value[secretId]);

  const isCommentCreating = (secretId: string): boolean =>
    Boolean(commentCreatingBySecret.value[secretId]);

  return {
    secrets,
    rankings,
    loading,
    rankingsLoading,
    error,
    initSecretsListener,
    initRankingsListener,
    cleanup,
    createSecret,
    loadSecretById,
    voteSecret,
    reportSecret,
    loadComments,
    createComment,
    getComments,
    isVotingPending,
    isReportPending,
    isCommentsLoading,
    isCommentCreating
  };
});
