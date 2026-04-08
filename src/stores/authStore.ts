import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<any>(null);
  const userProfile = ref<any>(null);
  const tokenClaims = ref<Record<string, unknown>>({});
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!user.value);

  const refreshTokenClaims = async (firebaseUser: any, forceRefresh = false) => {
    try {
      const idTokenResult = await firebaseUser.getIdTokenResult(forceRefresh);
      tokenClaims.value = (idTokenResult?.claims || {}) as Record<string, unknown>;
    } catch (err) {
      console.error('Error loading token claims:', err);
      tokenClaims.value = {};
    }
  };

  // Inicializar escucha de autenticación
  const initAuthListener = () => {
    return new Promise<void>((resolve) => {
      // 1. Manejar resultado de redirección (Google Auth)
      getRedirectResult(auth).then(async (result) => {
        if (result?.user) {
          await handleAuthSuccess(result.user);
        }
      }).catch((err) => {
        console.error('Error with redirect result:', err);
        error.value = err.message;
      });

      // 2. Escuchar cambios de estado
      onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          user.value = firebaseUser;
          await refreshTokenClaims(firebaseUser, true);
          
          // Cargar perfil del usuario
          try {
            const userDoc = await getDoc(
              doc(db, 'users', firebaseUser.uid)
            );
            if (userDoc.exists()) {
              userProfile.value = userDoc.data();
            }
          } catch (err) {
            console.error('Error loading user profile:', err);
          }
        } else {
          user.value = null;
          userProfile.value = null;
          tokenClaims.value = {};
        }
        resolve();
      });
    });
  };

  // Función auxiliar para manejar éxito de autenticación (Popup o Redirect)
  const handleAuthSuccess = async (firebaseUser: any) => {
    user.value = firebaseUser;
    await refreshTokenClaims(firebaseUser);

    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      userProfile.value = userDoc.data();
    } else {
      const email = firebaseUser.email || '';
      const nombre = firebaseUser.displayName || 'Usuario Google';
      const baseUsername = email ? email.split('@')[0] : `user${Math.floor(Math.random() * 10000)}`;
      const username = baseUsername.toLowerCase().replace(/[^a-z0-9_]/g, '');

      const profile = {
        id: firebaseUser.uid,
        email,
        nombre,
        username,
        rol: 'user',
        bio: '',
        location: '',
        website: '',
        profilePictureUrl: firebaseUser.photoURL || '',
        isVerified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          postsCount: 0,
          followersCount: 0,
          followingCount: 0,
          likesTotalCount: 0
        },
        settings: {
          notificationsEnabled: true,
          privateAccount: false,
          lastLogin: new Date().toISOString()
        }
      };

      await setDoc(userDocRef, profile);
      userProfile.value = profile;
    }
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

      // Cargar perfil
      const userDoc = await getDoc(
        doc(db, 'users', firebaseUser.uid)
      );
      if (userDoc.exists()) {
        userProfile.value = userDoc.data();
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
      // Crear usuario en Firebase Auth
      const { user: firebaseUser } = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Crear documento de perfil
      const profile = {
        id: firebaseUser.uid,
        email,
        nombre,
        username,
        rol: 'user',
        bio: '',
        location: '',
        website: '',
        profilePictureUrl: '',
        isVerified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          postsCount: 0,
          followersCount: 0,
          followingCount: 0,
          likesTotalCount: 0
        },
        settings: {
          notificationsEnabled: true,
          privateAccount: false,
          lastLogin: new Date().toISOString()
        }
      };

      await setDoc(doc(db, 'users', firebaseUser.uid), profile);

      user.value = firebaseUser;
      userProfile.value = profile;
      return { success: true };
    } catch (err: any) {
      error.value = err.message;
      return { success: false, error: err.message };
    } finally {
      loading.value = false;
    }
  };

  const loginWithGoogle = async () => {
    loading.value = true;
    error.value = null;

    try {
      const provider = new GoogleAuthProvider();
      // Usar redirect en vez de popup para evitar bloqueos de COOP en localhost
      await signInWithRedirect(auth, provider);
      // La página se recargará, el resultado se maneja en initAuthListener
    } catch (err: any) {
      error.value = err.message;
      loading.value = false;
      return { success: false, error: err.message };
    }
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
    initAuthListener,
    login,
    signup,
    loginWithGoogle,
    logout
  };
});
