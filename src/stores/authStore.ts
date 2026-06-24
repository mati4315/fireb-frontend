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
  getRedirectResult,
  signInWithCredential,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  linkWithPopup
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/config/firebase';
import { isNativePlatform } from '@/platform/capacitor';

type DefaultFeedTab = 'todo' | 'news' | 'post' | 'surveys' | 'lottery';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<any>(null);
  const userProfile = ref<any>(null);
  const tokenClaims = ref<Record<string, unknown>>({});
  const loading = ref(false);
  const isInitialized = ref(false);
  const error = ref<string | null>(null);
  let initPromise: Promise<void> | null = null;
  const updateMyProfileCallable = httpsCallable(functions, 'updateMyProfile');
  const updateHomeFeedPreferenceCallable = httpsCallable(functions, 'updateHomeFeedPreference');

  const isAuthenticated = computed(() => !!user.value);
  const socialProviders = computed(() => {
    const raw = (import.meta.env.VITE_AUTH_SOCIAL_PROVIDERS || 'google.com,facebook.com') as string;
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
    const preferredPic = (preferred?.profilePictureUrl || firebaseUser.photoURL || '').toString().trim();

    if (existingProfile) {
      const currentPic = (existingProfile.profilePictureUrl || '').toString().trim();
      // Si el perfil ya existe pero no tiene foto de perfil y ahora sí la tenemos disponible, lo actualizamos.
      if (!currentPic && preferredPic) {
        try {
          await updateMyProfileCallable({
            nombre: existingProfile.nombre || preferred?.nombre || firebaseUser.displayName || 'Usuario',
            username: existingProfile.username,
            bio: existingProfile.bio || '',
            location: existingProfile.location || '',
            website: existingProfile.website || '',
            profilePictureUrl: preferredPic
          });
          return await refreshUserProfile(firebaseUser.uid);
        } catch (err) {
          console.error('Error al actualizar la foto de perfil en el perfil existente:', err);
        }
      }
      return existingProfile;
    }

    const nombre = (preferred?.nombre || firebaseUser.displayName || 'Usuario')
      .trim()
      .slice(0, 120);
    const preferredUsername = normalizeUsername(preferred?.username || '');
    const username = /^[a-z0-9_]{3,30}$/.test(preferredUsername)
      ? preferredUsername
      : buildFallbackUsername(firebaseUser);
    const profilePictureUrl = preferredPic;

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
      if (isNativePlatform() && (providerId === 'google.com' || providerId === 'facebook.com')) {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
        const nativeResult = providerId === 'google.com'
          ? await FirebaseAuthentication.signInWithGoogle()
          : await FirebaseAuthentication.signInWithFacebook()

        const nativeCredential = nativeResult.credential
        if (!nativeCredential) {
          throw new Error('No se pudo obtener credencial nativa de autenticacion.')
        }

        let firebaseCredential
        if (providerId === 'google.com') {
          firebaseCredential = GoogleAuthProvider.credential(
            nativeCredential.idToken || null,
            nativeCredential.accessToken || null
          )
        } else {
          const facebookToken = nativeCredential.accessToken || ''
          if (!facebookToken) {
            throw new Error('No se pudo obtener token de Facebook.')
          }
          firebaseCredential = FacebookAuthProvider.credential(facebookToken)
        }

        const { user: firebaseUser } = await signInWithCredential(auth, firebaseCredential)
        user.value = firebaseUser
        await refreshTokenClaims(firebaseUser, true)
        await ensureProfileDocument(firebaseUser, {
          nombre: nativeResult.user?.displayName || undefined,
          profilePictureUrl: nativeResult.user?.photoUrl || undefined
        })
        loading.value = false
        return { success: true }
      }

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
      await ensureProfileDocument(firebaseUser);
      loading.value = false;
      return { success: true };
    } catch (err: any) {
      console.error('Login Error:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/popup-blocked') {
        if (err.code === 'auth/popup-blocked' && !isNativePlatform() && providerId === 'facebook.com') {
          try {
            await signInWithRedirect(auth, new FacebookAuthProvider());
            loading.value = false;
            return { success: true };
          } catch (redirectErr) {
            console.error('Facebook redirect fallback error:', redirectErr);
          }
        }
        error.value = err.code === 'auth/popup-blocked'
          ? 'El navegador bloqueó la ventana emergente de inicio de sesión. Por favor, permítela o intenta de nuevo.'
          : 'El inicio de sesion fue cancelado.';
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        const email = (err?.customData?.email || '').toString().trim();
        let message = 'Este correo ya existe con otro método. Inicia sesión con ese método para vincular la cuenta.';

        if (email) {
          try {
            const methods = await fetchSignInMethodsForEmail(auth, email);
            let pendingCredential: any = null;

            if (providerId === 'facebook.com') {
              pendingCredential = FacebookAuthProvider.credentialFromError(err);
            } else if (providerId === 'google.com') {
              pendingCredential = GoogleAuthProvider.credentialFromError(err);
            }

            if (pendingCredential && methods.includes('google.com')) {
              const googleProvider = new GoogleAuthProvider();
              const { user: existingUser } = await signInWithPopup(auth, googleProvider);

              try {
                await linkWithCredential(existingUser, pendingCredential);
              } catch (linkErr: any) {
                if (linkErr?.code !== 'auth/provider-already-linked' && linkErr?.code !== 'auth/credential-already-in-use') {
                  throw linkErr;
                }
              }

              user.value = existingUser;
              await refreshTokenClaims(existingUser, true);
              await ensureProfileDocument(existingUser);

              loading.value = false;
              error.value = null;
              return { success: true };
            }

            const labelsByMethod: Record<string, string> = {
              password: 'Email y contraseña',
              'google.com': 'Google',
              'facebook.com': 'Facebook',
              'apple.com': 'Apple',
              'github.com': 'GitHub'
            };
            if (methods.length > 0) {
              const labelList = methods.map((method) => labelsByMethod[method] || method).join(', ');
              message = `Este correo (${email}) ya está registrado con: ${labelList}. Usa ese método para iniciar sesión.`;
            }
          } catch (lookupError) {
            console.error('Error resolving sign-in methods:', lookupError);
          }
        }

        error.value = message;
      } else {
        error.value = err.message;
      }
      loading.value = false;
      return { success: false, error: error.value || err.message };
    }
  };

  const loginWithGoogle = async () => {
    return loginWithProvider('google.com');
  };

  const linkProvider = async (providerId: string) => {
    loading.value = true;
    error.value = null;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Debes iniciar sesion para vincular cuentas.');
      }

      if (isNativePlatform() && (providerId === 'google.com' || providerId === 'facebook.com')) {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        const nativeResult = providerId === 'google.com'
          ? await FirebaseAuthentication.signInWithGoogle()
          : await FirebaseAuthentication.signInWithFacebook();

        const nativeCredential = nativeResult.credential;
        if (!nativeCredential) {
          throw new Error('No se pudo obtener credencial nativa para vincular la cuenta.');
        }

        let firebaseCredential;
        if (providerId === 'google.com') {
          firebaseCredential = GoogleAuthProvider.credential(
            nativeCredential.idToken || null,
            nativeCredential.accessToken || null
          );
        } else {
          const facebookToken = nativeCredential.accessToken || '';
          if (!facebookToken) {
            throw new Error('No se pudo obtener token de Facebook.');
          }
          firebaseCredential = FacebookAuthProvider.credential(facebookToken);
        }

        await linkWithCredential(currentUser, firebaseCredential);
        // Aseguramos que se actualice la foto de perfil si estaba vacía usando los datos de la red social nativa
        await ensureProfileDocument(currentUser, {
          nombre: nativeResult.user?.displayName || undefined,
          profilePictureUrl: nativeResult.user?.photoUrl || undefined
        });
      } else {
        let provider: GoogleAuthProvider | FacebookAuthProvider | OAuthProvider;
        if (providerId === 'google.com') {
          provider = new GoogleAuthProvider();
        } else if (providerId === 'facebook.com') {
          provider = new FacebookAuthProvider();
        } else {
          provider = new OAuthProvider(providerId);
        }

        await linkWithPopup(currentUser, provider);
        // Aseguramos que se actualice la foto de perfil en web
        await ensureProfileDocument(currentUser);
      }

      await currentUser.reload();
      user.value = auth.currentUser;
      await refreshTokenClaims(currentUser, true);

      loading.value = false;
      return { success: true };
    } catch (err: any) {
      if (err?.code === 'auth/provider-already-linked') {
        loading.value = false;
        return { success: true };
      }
      if (err?.code === 'auth/popup-blocked' && !isNativePlatform() && providerId === 'facebook.com') {
        try {
          await signInWithRedirect(auth, new FacebookAuthProvider());
          loading.value = false;
          return { success: true };
        } catch (redirectErr) {
          console.error('Facebook link redirect fallback error:', redirectErr);
        }
      }
      console.error('Link Provider Error:', err);
      error.value = err?.message || 'No se pudo vincular la cuenta social.';
      loading.value = false;
      return { success: false, error: error.value };
    }
  };

  const logout = async () => {
    try {
      if (isNativePlatform()) {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await FirebaseAuthentication.signOut();
      }
      await signOut(auth);
      user.value = null;
      userProfile.value = null;
      tokenClaims.value = {};
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  const updateDefaultFeedTabPreference = async (defaultFeedTab: DefaultFeedTab) => {
    if (!user.value?.uid) {
      throw new Error('Debes iniciar sesion para configurar el feed.');
    }

    const response = await updateHomeFeedPreferenceCallable({ defaultFeedTab });
    const result = (response.data || {}) as Record<string, unknown>;
    if (result.settings) {
      setUserProfile({
        settings: result.settings
      });
    }

    return result;
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
    linkProvider,
    logout,
    updateDefaultFeedTabPreference
  };
});

