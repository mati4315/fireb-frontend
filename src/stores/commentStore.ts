import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from './authStore';
import { useModuleStore } from './moduleStore';

export type ContentModule = 'news' | 'community';

export interface CommentRecord {
  id: string;
  userId: string;
  userName: string;
  userProfilePicUrl: string;
  text: string;
  module: ContentModule;
  contentId: string;
  stats: {
    repliesCount: number;
  };
  createdAt: any;
  updatedAt: any;
  isEdited: boolean;
  deletedAt: any;
}

export interface ReplyRecord {
  id: string;
  userId: string;
  userName: string;
  userProfilePicUrl: string;
  text: string;
  module: ContentModule;
  contentId: string;
  commentId: string;
  createdAt: any;
  updatedAt: any;
  isEdited: boolean;
  deletedAt: any;
}

const COMMENT_PAGE_SIZE = 6;
const REPLY_INITIAL_PAGE_SIZE = 3;
const REPLY_PAGE_SIZE = 10;
const PREVIEW_COMMENT_LIMIT = 2;
const CACHE_TTL_MS = 5 * 60 * 1000;
const OVERFETCH_FACTOR = 3;

type CommentCacheItem = {
  comments: CommentRecord[];
  hasMore: boolean;
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  cachedAt: number;
};

const getReplyKey = (contentId: string, commentId: string) => `${contentId}::${commentId}`;

export const useCommentStore = defineStore('comments', () => {
  const authStore = useAuthStore();
  const moduleStore = useModuleStore();

  const commentsByContent = ref<Record<string, CommentRecord[]>>({});
  const commentsLoadingByContent = ref<Record<string, boolean>>({});
  const commentsHasMoreByContent = ref<Record<string, boolean>>({});
  const commentCursorByContent = ref<
    Record<string, QueryDocumentSnapshot<DocumentData> | null>
  >({});
  const commentListenerByContent = ref<Record<string, Unsubscribe | null>>({});
  const previewCommentsByContent = ref<Record<string, CommentRecord[]>>({});
  const previewLoadingByContent = ref<Record<string, boolean>>({});
  const previewFetchedAtByContent = ref<Record<string, number>>({});

  const repliesByComment = ref<Record<string, ReplyRecord[]>>({});
  const repliesLoadingByComment = ref<Record<string, boolean>>({});
  const repliesHasMoreByComment = ref<Record<string, boolean>>({});
  const replyCursorByComment = ref<
    Record<string, QueryDocumentSnapshot<DocumentData> | null>
  >({});

  const commentCache = new Map<string, CommentCacheItem>();

  const getAuthorName = (): string => {
    const fromProfile = (authStore.userProfile?.nombre || '').trim();
    if (fromProfile) return fromProfile.slice(0, 120);

    const fromAuthDisplayName = (authStore.user?.displayName || '').trim();
    if (fromAuthDisplayName) return fromAuthDisplayName.slice(0, 120);

    const email = (authStore.user?.email || '').trim();
    if (email) return email.split('@')[0].slice(0, 120);

    return 'Usuario';
  };

  const getAuthorProfilePic = (): string => {
    const fromProfile = (authStore.userProfile?.profilePictureUrl || '').trim();
    if (fromProfile) return fromProfile;
    return (authStore.user?.photoURL || '').trim();
  };

  const isCommentsEnabledForModule = (module: ContentModule) => {
    return moduleStore.isCommentsEnabledForModule(module);
  };

  const mapCommentDoc = (commentDoc: QueryDocumentSnapshot<DocumentData>): CommentRecord => {
    const data = commentDoc.data() || {};
    return {
      id: commentDoc.id,
      userId: data.userId || '',
      userName: data.userName || 'Usuario',
      userProfilePicUrl: data.userProfilePicUrl || '',
      text: data.text || '',
      module: data.module === 'news' ? 'news' : 'community',
      contentId: data.contentId || '',
      stats: {
        repliesCount: Number(data?.stats?.repliesCount || 0)
      },
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
      isEdited: Boolean(data.isEdited),
      deletedAt: data.deletedAt || null
    };
  };

  const mapReplyDoc = (replyDoc: QueryDocumentSnapshot<DocumentData>): ReplyRecord => {
    const data = replyDoc.data() || {};
    return {
      id: replyDoc.id,
      userId: data.userId || '',
      userName: data.userName || 'Usuario',
      userProfilePicUrl: data.userProfilePicUrl || '',
      text: data.text || '',
      module: data.module === 'news' ? 'news' : 'community',
      contentId: data.contentId || '',
      commentId: data.commentId || '',
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
      isEdited: Boolean(data.isEdited),
      deletedAt: data.deletedAt || null
    };
  };

  const setCommentLocal = (
    contentId: string,
    commentId: string,
    updater: (comment: CommentRecord) => CommentRecord
  ) => {
    const comments = commentsByContent.value[contentId] || [];
    commentsByContent.value[contentId] = comments.map((comment) =>
      comment.id === commentId ? updater(comment) : comment
    );
    syncPreviewComments(contentId);
    writeCache(contentId);
  };

  const removeCommentLocal = (contentId: string, commentId: string) => {
    const comments = commentsByContent.value[contentId] || [];
    commentsByContent.value[contentId] = comments.filter((comment) => comment.id !== commentId);
    syncPreviewComments(contentId);
    writeCache(contentId);
  };

  const setReplyLocal = (
    contentId: string,
    commentId: string,
    replyId: string,
    updater: (reply: ReplyRecord) => ReplyRecord
  ) => {
    const key = getReplyKey(contentId, commentId);
    const replies = repliesByComment.value[key] || [];
    repliesByComment.value[key] = replies.map((reply) =>
      reply.id === replyId ? updater(reply) : reply
    );
  };

  const removeReplyLocal = (contentId: string, commentId: string, replyId: string) => {
    const key = getReplyKey(contentId, commentId);
    const replies = repliesByComment.value[key] || [];
    repliesByComment.value[key] = replies.filter((reply) => reply.id !== replyId);
  };

  const updateLocalReplyCount = (contentId: string, commentId: string, delta: number) => {
    setCommentLocal(contentId, commentId, (comment) => ({
      ...comment,
      stats: {
        ...comment.stats,
        repliesCount: Math.max(0, Number(comment?.stats?.repliesCount || 0) + delta)
      }
    }));
  };

  const readCache = (contentId: string): boolean => {
    const cached = commentCache.get(contentId);
    if (!cached) return false;
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      commentCache.delete(contentId);
      return false;
    }

    commentsByContent.value[contentId] = cached.comments;
    commentsHasMoreByContent.value[contentId] = cached.hasMore;
    commentCursorByContent.value[contentId] = cached.cursor;
    syncPreviewComments(contentId);
    return true;
  };

  const syncPreviewComments = (contentId: string, previewLimit = PREVIEW_COMMENT_LIMIT) => {
    const comments = commentsByContent.value[contentId] || [];
    previewCommentsByContent.value[contentId] = comments.slice(0, previewLimit);
    previewFetchedAtByContent.value[contentId] = Date.now();
  };

  const writeCache = (contentId: string) => {
    commentCache.set(contentId, {
      comments: commentsByContent.value[contentId] || [],
      hasMore: commentsHasMoreByContent.value[contentId] ?? true,
      cursor: commentCursorByContent.value[contentId] || null,
      cachedAt: Date.now()
    });
  };

  const attachNewCommentListener = (contentId: string) => {
    if (commentListenerByContent.value[contentId]) return;

    const newestCommentQuery = query(
      collection(db, 'content', contentId, 'comments'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    commentListenerByContent.value[contentId] = onSnapshot(
      newestCommentQuery,
      (snapshot) => {
        if (snapshot.empty) return;
        const firstAliveDoc = snapshot.docs.find((commentDoc) => {
          const data = commentDoc.data() || {};
          return data.deletedAt == null;
        });
        if (!firstAliveDoc) return;

        const incoming = mapCommentDoc(firstAliveDoc);
        const comments = commentsByContent.value[contentId] || [];
        const existingIndex = comments.findIndex((comment) => comment.id === incoming.id);

        if (existingIndex >= 0) {
          commentsByContent.value[contentId] = comments.map((comment, index) =>
            index === existingIndex ? incoming : comment
          );
          syncPreviewComments(contentId);
          writeCache(contentId);
          return;
        }

        commentsByContent.value[contentId] = [incoming, ...comments];
        syncPreviewComments(contentId);
        writeCache(contentId);
      },
      (error) => {
        console.error('Error in comments listener:', error);
      }
    );
  };

  const loadComments = async (
    contentId: string,
    options: { reset?: boolean; pageSize?: number } = {}
  ) => {
    const reset = Boolean(options.reset);
    const pageSize = Math.max(1, Math.floor(options.pageSize || COMMENT_PAGE_SIZE));
    const fetchSize = Math.max(pageSize, pageSize * OVERFETCH_FACTOR);

    if (commentsLoadingByContent.value[contentId]) return;
    if (!reset && commentsHasMoreByContent.value[contentId] === false) return;

    commentsLoadingByContent.value[contentId] = true;

    if (reset) {
      commentsByContent.value[contentId] = [];
      commentCursorByContent.value[contentId] = null;
      commentsHasMoreByContent.value[contentId] = true;
    }

    try {
      const constraints: QueryConstraint[] = [
        orderBy('createdAt', 'desc'),
        limit(fetchSize)
      ];

      const cursor = commentCursorByContent.value[contentId];
      if (!reset && cursor) {
        constraints.push(startAfter(cursor));
      }

      const commentsQuery = query(
        collection(db, 'content', contentId, 'comments'),
        ...constraints
      );
      const snapshot = await getDocs(commentsQuery);
      const fetchedComments = snapshot.docs
        .map(mapCommentDoc)
        .filter((comment) => comment.deletedAt == null)
        .slice(0, pageSize);

      if (reset) {
        commentsByContent.value[contentId] = fetchedComments;
      } else {
        const existing = commentsByContent.value[contentId] || [];
        const merged = [...existing];
        for (const comment of fetchedComments) {
          if (!merged.some((item) => item.id === comment.id)) {
            merged.push(comment);
          }
        }
        commentsByContent.value[contentId] = merged;
      }

      commentCursorByContent.value[contentId] =
        snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
      commentsHasMoreByContent.value[contentId] = snapshot.size >= fetchSize;
      syncPreviewComments(contentId);
      writeCache(contentId);
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      commentsLoadingByContent.value[contentId] = false;
    }
  };

  const loadPreviewComments = async (contentId: string, previewLimit = PREVIEW_COMMENT_LIMIT) => {
    const limitSize = Math.max(1, Math.floor(previewLimit));
    const fetchedAt = previewFetchedAtByContent.value[contentId] || 0;
    const hasFreshPreview = (Date.now() - fetchedAt) < CACHE_TTL_MS;

    if (previewLoadingByContent.value[contentId]) return;
    if (hasFreshPreview && (previewCommentsByContent.value[contentId] || []).length > 0) return;

    const existingComments = commentsByContent.value[contentId] || [];
    if (existingComments.length > 0) {
      syncPreviewComments(contentId, limitSize);
      return;
    }

    previewLoadingByContent.value[contentId] = true;
    try {
      const fetchSize = Math.max(limitSize, limitSize * OVERFETCH_FACTOR);
      const previewQuery = query(
        collection(db, 'content', contentId, 'comments'),
        orderBy('createdAt', 'desc'),
        limit(fetchSize)
      );

      const snapshot = await getDocs(previewQuery);
      const previewItems = snapshot.docs
        .map(mapCommentDoc)
        .filter((comment) => comment.deletedAt == null)
        .slice(0, limitSize);

      previewCommentsByContent.value[contentId] = previewItems;
      previewFetchedAtByContent.value[contentId] = Date.now();
    } catch (error) {
      console.error('Error loading preview comments:', error);
    } finally {
      previewLoadingByContent.value[contentId] = false;
    }
  };

  const loadReplies = async (
    contentId: string,
    commentId: string,
    options: { reset?: boolean; pageSize?: number } = {}
  ) => {
    const reset = Boolean(options.reset);
    const pageSize = Math.max(
      1,
      Math.floor(options.pageSize || (reset ? REPLY_INITIAL_PAGE_SIZE : REPLY_PAGE_SIZE))
    );
    const fetchSize = Math.max(pageSize, pageSize * OVERFETCH_FACTOR);
    const key = getReplyKey(contentId, commentId);

    if (repliesLoadingByComment.value[key]) return;
    if (!reset && repliesHasMoreByComment.value[key] === false) return;

    repliesLoadingByComment.value[key] = true;

    if (reset) {
      repliesByComment.value[key] = [];
      replyCursorByComment.value[key] = null;
      repliesHasMoreByComment.value[key] = true;
    }

    try {
      const constraints: QueryConstraint[] = [
        orderBy('createdAt', 'asc'),
        limit(fetchSize)
      ];

      const cursor = replyCursorByComment.value[key];
      if (!reset && cursor) {
        constraints.push(startAfter(cursor));
      }

      const repliesQuery = query(
        collection(db, 'content', contentId, 'comments', commentId, 'replies'),
        ...constraints
      );
      const snapshot = await getDocs(repliesQuery);
      const fetchedReplies = snapshot.docs
        .map(mapReplyDoc)
        .filter((reply) => reply.deletedAt == null)
        .slice(0, pageSize);

      if (reset) {
        repliesByComment.value[key] = fetchedReplies;
      } else {
        const existing = repliesByComment.value[key] || [];
        const merged = [...existing];
        for (const reply of fetchedReplies) {
          if (!merged.some((item) => item.id === reply.id)) {
            merged.push(reply);
          }
        }
        repliesByComment.value[key] = merged;
      }

      replyCursorByComment.value[key] =
        snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
      repliesHasMoreByComment.value[key] = snapshot.size >= fetchSize;
    } catch (error) {
      console.error('Error loading replies:', error);
    } finally {
      repliesLoadingByComment.value[key] = false;
    }
  };

  const openThread = async (contentId: string, module: ContentModule) => {
    if (!isCommentsEnabledForModule(module)) return;

    const usedCache = readCache(contentId);
    if (!usedCache) {
      await loadComments(contentId, { reset: true });
    }
    attachNewCommentListener(contentId);
  };

  const closeThread = (contentId: string) => {
    const unsubscribe = commentListenerByContent.value[contentId];
    if (unsubscribe) {
      unsubscribe();
      commentListenerByContent.value[contentId] = null;
    }
  };

  const closeAllThreads = () => {
    Object.values(commentListenerByContent.value).forEach((unsubscribe) => {
      if (unsubscribe) unsubscribe();
    });
    commentListenerByContent.value = {};
  };

  const createComment = async (contentId: string, module: ContentModule, text: string) => {
    if (!authStore.user) {
      throw new Error('Debes iniciar sesion para comentar.');
    }
    if (!isCommentsEnabledForModule(module)) {
      throw new Error('Los comentarios estan deshabilitados para este modulo.');
    }

    const payload = {
      userId: authStore.user.uid,
      userName: getAuthorName(),
      userProfilePicUrl: getAuthorProfilePic(),
      text: text.trim(),
      module,
      contentId,
      stats: {
        repliesCount: 0
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isEdited: false,
      deletedAt: null
    };

    await addDoc(collection(db, 'content', contentId, 'comments'), payload);
    await loadComments(contentId, { reset: true });
    syncPreviewComments(contentId);
  };

  const createReply = async (
    contentId: string,
    commentId: string,
    module: ContentModule,
    text: string
  ) => {
    if (!authStore.user) {
      throw new Error('Debes iniciar sesion para responder.');
    }
    if (!isCommentsEnabledForModule(module)) {
      throw new Error('Las respuestas estan deshabilitadas para este modulo.');
    }

    const payload = {
      userId: authStore.user.uid,
      userName: getAuthorName(),
      userProfilePicUrl: getAuthorProfilePic(),
      text: text.trim(),
      module,
      contentId,
      commentId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isEdited: false,
      deletedAt: null
    };

    await addDoc(collection(db, 'content', contentId, 'comments', commentId, 'replies'), payload);
    updateLocalReplyCount(contentId, commentId, 1);
    await loadReplies(contentId, commentId, { reset: true, pageSize: REPLY_PAGE_SIZE });
  };

  const editComment = async (contentId: string, commentId: string, text: string) => {
    await updateDoc(doc(db, 'content', contentId, 'comments', commentId), {
      text: text.trim(),
      updatedAt: serverTimestamp(),
      isEdited: true
    });

    setCommentLocal(contentId, commentId, (comment) => ({
      ...comment,
      text: text.trim(),
      isEdited: true
    }));
  };

  const softDeleteComment = async (contentId: string, commentId: string) => {
    await updateDoc(doc(db, 'content', contentId, 'comments', commentId), {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    removeCommentLocal(contentId, commentId);
  };

  const editReply = async (
    contentId: string,
    commentId: string,
    replyId: string,
    text: string
  ) => {
    await updateDoc(doc(db, 'content', contentId, 'comments', commentId, 'replies', replyId), {
      text: text.trim(),
      updatedAt: serverTimestamp(),
      isEdited: true
    });

    setReplyLocal(contentId, commentId, replyId, (reply) => ({
      ...reply,
      text: text.trim(),
      isEdited: true
    }));
  };

  const softDeleteReply = async (contentId: string, commentId: string, replyId: string) => {
    await updateDoc(doc(db, 'content', contentId, 'comments', commentId, 'replies', replyId), {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    removeReplyLocal(contentId, commentId, replyId);
    updateLocalReplyCount(contentId, commentId, -1);
  };

  const getComments = (contentId: string): CommentRecord[] =>
    commentsByContent.value[contentId] || [];

  const getPreviewComments = (contentId: string): CommentRecord[] =>
    previewCommentsByContent.value[contentId] || [];

  const isPreviewCommentsLoading = (contentId: string): boolean =>
    previewLoadingByContent.value[contentId] || false;

  const isCommentsLoading = (contentId: string): boolean =>
    commentsLoadingByContent.value[contentId] || false;

  const hasMoreComments = (contentId: string): boolean =>
    commentsHasMoreByContent.value[contentId] ?? true;

  const getReplies = (contentId: string, commentId: string): ReplyRecord[] => {
    const key = getReplyKey(contentId, commentId);
    return repliesByComment.value[key] || [];
  };

  const isRepliesLoading = (contentId: string, commentId: string): boolean => {
    const key = getReplyKey(contentId, commentId);
    return repliesLoadingByComment.value[key] || false;
  };

  const hasMoreReplies = (contentId: string, commentId: string): boolean => {
    const key = getReplyKey(contentId, commentId);
    return repliesHasMoreByComment.value[key] ?? true;
  };

  return {
    createComment,
    createReply,
    editComment,
    softDeleteComment,
    editReply,
    softDeleteReply,
    loadComments,
    loadPreviewComments,
    loadReplies,
    openThread,
    closeThread,
    closeAllThreads,
    getComments,
    getPreviewComments,
    isPreviewCommentsLoading,
    isCommentsLoading,
    hasMoreComments,
    getReplies,
    isRepliesLoading,
    hasMoreReplies,
    isCommentsEnabledForModule
  };
});
