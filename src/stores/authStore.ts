import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/config/firebase';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<any>(null);
  const userProfile = ref<any>(null);
  const tokenClaims = ref<Record<string, unknown>>({});
  const loading = ref(false);
  const isInitialized = ref(false);
  const error = ref<string | null>(null);
  let initPromise: Promise<void> | null = null;
  const updateMyProfileCallable = httpsCallable(functions, 'updateMyProfile');

  const isAuthenticated = computed(() => !!user.value);
  const socialProviders = computed(() => {
    const raw = (import.meta.env.VITE_AUTH_SOCIAL_PROVIDERS || 'google.com') as string;
    const unique = new Set(
      raw
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    );

    if (unique.size === 0) {
      unique.add('google.com');
    }

    const metaByProviderId: Record<string, { label: string }> = {
      'google.com': { label: 'Google' },
      'facebook.com': { label: 'Facebook' },
      'apple.com': { label: 'Apple' },
      'github.com': { label: 'GitHub' }
    };

    return Array.from(unique).map((id) => ({
      id,
      label: metaByProviderId[id]?.label || id
    }));
  });

  const normalizeUsername = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);

  const buildFallbackUsername = (firebaseUser: any) => {
    const fromEmail = typeof firebaseUser?.email === 'string'
      ? firebaseUser.email.split('@')[0]
      : '';
    const candidate = normalizeUsername(fromEmail || `user_${firebaseUser?.uid || ''}`);
    if (candidate.length >= 3) return candidate;

    const fromUid = normalizeUsername(`user_${String(firebaseUser?.uid || '').slice(0, 8)}`);
    return fromUid.length >= 3 ? fromUid : 'user_perfil';
  };

  const setUserProfile = (profile: any) => {
    if (!profile) {
      userProfile.value = null;
      return;
    }

    userProfile.value = {
      ...(userProfile.value || {}),
      ...profile
    };
  };

  const refreshTokenClaims = async (firebaseUser: any, forceRefresh = false) => {
    try {
      const idTokenResult = await firebaseUser.getIdTokenResult(forceRefresh);
      tokenClaims.value = (idTokenResult?.claims || {}) as Record<string, unknown>;
    } catch (err) {
      console.error('Error loading token claims:', err);
      tokenClaims.value = {};
    }
  };

  const refreshUserProfile = async (uid?: string) => {
    const targetUid = uid || user.value?.uid;
    if (!targetUid) {
      userProfile.value = null;
      return null;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', targetUid));
      if (!userDoc.exists()) {
        userProfile.value = null;
        return null;
      }

      const profile = userDoc.data();
      setUserProfile(profile);
      return profile;
    } catch (err) {
      console.error('Error loading user profile:', err);
      return null;
    }
  };

  const ensureProfileDocument = async (
    firebaseUser: any,
    preferred?: { nombre?: string; username?: string; profilePictureUrl?: string }
  ) => {
    const existingProfile = await refreshUserProfile(firebaseUser.uid);
    if (existingProfile) return existingProfile;

    const nombre = (preferred?.nombre || firebaseUser.displayName || 'Usuario')
      .trim()
      .slice(0, 120);
    const preferredUsername = normalizeUsername(preferred?.username || '');
    const username = /^[a-z0-9_]{3,30}$/.test(preferredUsername)
      ? preferredUsername
      : buildFallbackUsername(firebaseUser);
    const profilePictureUrl = (preferred?.profilePictureUrl || firebaseUser.photoURL || '')
      .toString()
      .trim();

    await updateMyProfileCallable({
      nombre,
      username,
      bio: '',
      location: '',
      website: '',
      profilePictureUrl
    });

    const refreshed = await refreshUserProfile(firebaseUser.uid);
    if (!refreshed) {
      throw new Error('No se pudo crear el perfil de usuario.');
    }

    return refreshed;
  };

  const initAuthListener = () => {
    if (initPromise) return initPromise;

    return initPromise = new Promise<void>((resolve) => {
      getRedirectResult(auth)
        .then(async (result) => {
          if (result?.user) {
            await handleAuthSuccess(result.user);
          }
        })
        .catch((err) => {
          console.error('Error with redirect result:', err);
          error.value = err.message;
        });

      onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          user.value = firebaseUser;
          await refreshTokenClaims(firebaseUser, true);

          try {
            const profile = await refreshUserProfile(firebaseUser.uid);
            if (!profile) {
              await ensureProfileDocument(firebaseUser);
            }
          } catch (err) {
            console.error('Error initializing user profile:', err);
          }
        } else {
          user.value = null;
          userProfile.value = null;
          tokenClaims.value = {};
        }

        isInitialized.value = true;
        resolve();
      });
    });
  };

  const handleAuthSuccess = async (firebaseUser: any) => {
    user.value = firebaseUser;
    await refreshTokenClaims(firebaseUser, true);
    await ensureProfileDocument(firebaseUser);
  };

  const login = async (email: string, password: string) => {
    loading.value = true;
    error.value = null;

    try {
      const { user: firebaseUser } = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      user.value = firebaseUser;
      await refreshTokenClaims(firebaseUser, true);

      const profile = await refreshUserProfile(firebaseUser.uid);
      if (!profile) {
        await ensureProfileDocument(firebaseUser);
      }

      return { success: true };
    } catch (err: any) {
      error.value = err.message;
      return { success: false, error: err.message };
    } finally {
      loading.value = false;
    }
  };

  const signup = async (email: string, password: string, nombre: string, username: string) => {
    loading.value = true;
    error.value = null;

    try {
      const safeUsername = normalizeUsername(username);
      if (!/^[a-z0-9_]{3,30}$/.test(safeUsername)) {
        throw new Error('Username invalido. Usa entre 3 y 30 caracteres: a-z, 0-9 y _.');
      }
      if (!nombre.trim()) {
        throw new Error('El nombre es obligatorio.');
      }

      const { user: firebaseUser } = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      user.value = firebaseUser;
      await refreshTokenClaims(firebaseUser, true);
      await ensureProfileDocument(firebaseUser, {
        nombre,
        username: safeUsername,
        profilePictureUrl: ''
      });

      return { success: true };
    } catch (err: any) {
      error.value = err.message;
      return { success: false, error: err.message };
    } finally {
      loading.value = false;
    }
  };

  const loginWithProvider = async (providerId: string) => {
    loading.value = true;
    error.value = null;

    try {
      let provider: GoogleAuthProvider | FacebookAuthProvider | OAuthProvider;
      if (providerId === 'google.com') {
        provider = new GoogleAuthProvider();
      } else if (providerId === 'facebook.com') {
        provider = new FacebookAuthProvider();
      } else {
        provider = new OAuthProvider(providerId);
      }

      const { user: firebaseUser } = await signInWithPopup(auth, provider);
      user.value = firebaseUser;
      await refreshTokenClaims(firebaseUser, true);
      const profile = await refreshUserProfile(firebaseUser.uid);
      if (!profile) {
        await ensureProfileDocument(firebaseUser);
      }
      loading.value = false;
      return { success: true };
    } catch (err: any) {
      console.error('Login Error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        error.value = 'El inicio de sesión fue cancelado.';
      } else {
        error.value = err.message;
      }
      loading.value = false;
      return { success: false, error: err.message };
    }
  };

  const loginWithGoogle = async () => {
    return loginWithProvider('google.com');
  };

  const logout = async () => {
    try {
      await signOut(auth);
      user.value = null;
      userProfile.value = null;
      tokenClaims.value = {};
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  return {
    user,
    userProfile,
    tokenClaims,
    loading,
    error,
    isAuthenticated,
    isInitialized,
    socialProviders,
    setUserProfile,
    refreshUserProfile,
    initAuthListener,
    login,
    signup,
    loginWithProvider,
    loginWithGoogle,
    logout
  };
});
