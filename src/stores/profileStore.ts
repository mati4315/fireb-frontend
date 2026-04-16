import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { useAuthStore } from './authStore';

const PROFILE_POSTS_PAGE_SIZE = 8;
const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

type RawStats = {
  postsCount?: unknown;
  followersCount?: unknown;
  followingCount?: unknown;
  likesTotalCount?: unknown;
};

export type ProfileStats = {
  postsCount: number;
  followersCount: number;
  followingCount: number;
  likesTotalCount: number;
};

export type PublicProfile = {
  userId: string;
  username: string;
  usernameLower: string;
  nombre: string;
  bio: string;
  location: string;
  website: string;
  profilePictureUrl: string;
  isVerified: boolean;
  rol?: string; // Add optional role property
  stats: ProfileStats;
};

type UpdateProfilePayload = {
  nombre: string;
  username: string;
  bio: string;
  location: string;
  website: string;
  profilePictureUrl: string;
};

const normalizeUsernameInput = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
};

const toSafeInt = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const toStats = (value: RawStats | undefined): ProfileStats => ({
  postsCount: toSafeInt(value?.postsCount),
  followersCount: toSafeInt(value?.followersCount),
  followingCount: toSafeInt(value?.followingCount),
  likesTotalCount: toSafeInt(value?.likesTotalCount)
});

const toPublicProfile = (userId: string, data: Record<string, unknown>): PublicProfile => {
  const usernameLower = normalizeUsernameInput(String(data.usernameLower || data.username || ''));
  const username = usernameLower || `user_${userId.slice(0, 8).toLowerCase()}`;

  return {
    userId,
    username,
    usernameLower: username,
    nombre: String(data.nombre || 'Usuario').trim() || 'Usuario',
    bio: String(data.bio || '').trim(),
    location: String(data.location || '').trim(),
    website: String(data.website || '').trim(),
    profilePictureUrl: String(data.profilePictureUrl || '').trim(),
    isVerified: data.isVerified === true,
    rol: typeof data.rol === 'string' ? data.rol : undefined,
    stats: toStats((data.stats || {}) as RawStats)
  };
};

export const useProfileStore = defineStore('profile', () => {
  const authStore = useAuthStore();

  const profilesByUid = ref<Record<string, PublicProfile>>({});
  const uidByUsername = ref<Record<string, string>>({});
  const postsByUid = ref<Record<string, any[]>>({});
  const hasMorePostsByUid = ref<Record<string, boolean>>({});
  const loadingPostsByUid = ref<Record<string, boolean>>({});
  const lastPostDocByUid = ref<Record<string, QueryDocumentSnapshot<DocumentData> | null>>({});

  const cachePublicProfile = (profile: PublicProfile) => {
    profilesByUid.value = {
      ...profilesByUid.value,
      [profile.userId]: profile
    };
    uidByUsername.value = {
      ...uidByUsername.value,
      [profile.usernameLower]: profile.userId
    };
  };

  const cacheFromAnyProfile = (profile: Record<string, unknown>, userId: string) => {
    cachePublicProfile(
      toPublicProfile(userId, profile)
    );
  };

  const getCachedProfile = (userId: string): PublicProfile | null => {
    return profilesByUid.value[userId] || null;
  };

  const resolveUidByUsername = async (
    usernameOrUid: string,
    force = false
  ): Promise<string | null> => {
    const normalized = normalizeUsernameInput(usernameOrUid);
    if (!normalized) return null;

    if (!force && uidByUsername.value[normalized]) {
      return uidByUsername.value[normalized];
    }

    const usernameDoc = await getDoc(doc(db, 'usernames', normalized));
    if (usernameDoc.exists()) {
      const uid = String(usernameDoc.data()?.uid || '').trim();
      if (uid) {
        uidByUsername.value = {
          ...uidByUsername.value,
          [normalized]: uid
        };
        return uid;
      }
    }

    const directUserPublicDoc = await getDoc(doc(db, 'users_public', usernameOrUid));
    if (directUserPublicDoc.exists()) {
      return directUserPublicDoc.id;
    }

    return null;
  };

  const getPublicProfileByUid = async (
    userId: string,
    force = false
  ): Promise<PublicProfile | null> => {
    const uid = userId.trim();
    if (!uid) return null;

    if (!force && profilesByUid.value[uid]) {
      return profilesByUid.value[uid];
    }

    const userPublicDoc = await getDoc(doc(db, 'users_public', uid));
    if (userPublicDoc.exists()) {
      const profile = toPublicProfile(uid, userPublicDoc.data() as Record<string, unknown>);
      cachePublicProfile(profile);
      return profile;
    }

    if (authStore.user?.uid === uid && authStore.userProfile) {
      const ownProfile = toPublicProfile(uid, authStore.userProfile as Record<string, unknown>);
      cachePublicProfile(ownProfile);
      return ownProfile;
    }

    return null;
  };

  const getPublicProfileByUsername = async (
    usernameOrUid: string,
    force = false
  ): Promise<PublicProfile | null> => {
    const resolvedUid = await resolveUidByUsername(usernameOrUid, force);
    if (!resolvedUid) return null;
    return getPublicProfileByUid(resolvedUid, force);
  };

  const loadUserPosts = async (userId: string, reset = false): Promise<any[]> => {
    const uid = userId.trim();
    if (!uid) return [];

    if (loadingPostsByUid.value[uid]) {
      return postsByUid.value[uid] || [];
    }

    if (reset) {
      postsByUid.value = {
        ...postsByUid.value,
        [uid]: []
      };
      hasMorePostsByUid.value = {
        ...hasMorePostsByUid.value,
        [uid]: true
      };
      lastPostDocByUid.value = {
        ...lastPostDocByUid.value,
        [uid]: null
      };
    }

    if (!hasMorePostsByUid.value[uid] && !reset) {
      return postsByUid.value[uid] || [];
    }

    loadingPostsByUid.value = {
      ...loadingPostsByUid.value,
      [uid]: true
    };

    try {
      const constraints: QueryConstraint[] = [
        where('userId', '==', uid),
        where('deletedAt', '==', null),
        orderBy('createdAt', 'desc'),
        limit(PROFILE_POSTS_PAGE_SIZE)
      ];

      const cursor = lastPostDocByUid.value[uid];
      if (!reset && cursor) {
        constraints.push(startAfter(cursor));
      }

      const snapshot = await getDocs(query(collection(db, 'content'), ...constraints));
      const newItems = snapshot.docs.map((postDoc) => ({
        id: postDoc.id,
        ...postDoc.data()
      }));
      const previous = reset ? [] : (postsByUid.value[uid] || []);

      postsByUid.value = {
        ...postsByUid.value,
        [uid]: [...previous, ...newItems]
      };
      hasMorePostsByUid.value = {
        ...hasMorePostsByUid.value,
        [uid]: snapshot.size >= PROFILE_POSTS_PAGE_SIZE
      };
      lastPostDocByUid.value = {
        ...lastPostDocByUid.value,
        [uid]: snapshot.empty ? cursor || null : snapshot.docs[snapshot.docs.length - 1]
      };

      return postsByUid.value[uid];
    } finally {
      loadingPostsByUid.value = {
        ...loadingPostsByUid.value,
        [uid]: false
      };
    }
  };

  const getPostsForUser = (userId: string): any[] => {
    return postsByUid.value[userId] || [];
  };

  const hasMorePostsForUser = (userId: string): boolean => {
    return hasMorePostsByUid.value[userId] !== false;
  };

  const isLoadingPostsForUser = (userId: string): boolean => {
    return loadingPostsByUid.value[userId] === true;
  };

  const checkUsernameAvailability = async (
    rawUsername: string,
    currentUserId: string
  ): Promise<{ normalized: string; available: boolean; ownerUid: string | null }> => {
    const normalized = normalizeUsernameInput(rawUsername);
    if (!USERNAME_REGEX.test(normalized)) {
      return { normalized, available: false, ownerUid: null };
    }

    const usernameDoc = await getDoc(doc(db, 'usernames', normalized));
    if (!usernameDoc.exists()) {
      return { normalized, available: true, ownerUid: null };
    }

    const ownerUid = String(usernameDoc.data()?.uid || '').trim() || null;
    return {
      normalized,
      available: ownerUid === currentUserId,
      ownerUid
    };
  };

  const updateMyProfile = async (payload: UpdateProfilePayload) => {
    if (!authStore.user?.uid) {
      throw new Error('No autenticado');
    }

    const callable = httpsCallable(functions, 'updateMyProfile');
    const response = await callable(payload);
    const result = (response.data || {}) as Record<string, any>;

    if (result.profile) {
      authStore.setUserProfile(result.profile);
      cacheFromAnyProfile(result.profile as Record<string, unknown>, authStore.user.uid);
    }
    if (result.publicProfile) {
      cachePublicProfile(
        toPublicProfile(
          String(result.publicProfile.userId || authStore.user.uid),
          result.publicProfile as Record<string, unknown>
        )
      );
    }

    return result;
  };

  const isFollowingUser = async (targetUserId: string): Promise<boolean> => {
    const currentUserId = authStore.user?.uid;
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) return false;

    const followerRef = doc(db, 'relationships', targetUserId, 'followers', currentUserId);
    const snap = await getDoc(followerRef);
    return snap.exists();
  };

  const followUser = async (targetUserId: string) => {
    const currentUserId = authStore.user?.uid;
    if (!currentUserId) {
      throw new Error('No autenticado');
    }
    if (currentUserId === targetUserId) return;

    const followerRef = doc(db, 'relationships', targetUserId, 'followers', currentUserId);
    const followingRef = doc(db, 'relationships', currentUserId, 'following', targetUserId);

    await Promise.all([
      setDoc(followerRef, { createdAt: serverTimestamp() }, { merge: true }),
      setDoc(followingRef, { createdAt: serverTimestamp() }, { merge: true })
    ]);
  };

  const unfollowUser = async (targetUserId: string) => {
    const currentUserId = authStore.user?.uid;
    if (!currentUserId || currentUserId === targetUserId) return;

    const followerRef = doc(db, 'relationships', targetUserId, 'followers', currentUserId);
    const followingRef = doc(db, 'relationships', currentUserId, 'following', targetUserId);

    await Promise.all([
      deleteDoc(followerRef),
      deleteDoc(followingRef)
    ]);
  };

  return {
    normalizeUsernameInput,
    cacheFromAnyProfile,
    getCachedProfile,
    resolveUidByUsername,
    getPublicProfileByUid,
    getPublicProfileByUsername,
    loadUserPosts,
    getPostsForUser,
    hasMorePostsForUser,
    isLoadingPostsForUser,
    checkUsernameAvailability,
    updateMyProfile,
    isFollowingUser,
    followUser,
    unfollowUser
  };
});
