<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore, type PublicProfile } from '@/stores/profileStore';
import { useStorageStore } from '@/stores/storageStore';
import { useFeedStore } from '@/stores/feedStore';
import { db } from '@/config/firebase';
import { collection, collectionGroup, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { processImageForPost, validateImageFile } from '@/utils/imageProcessing';
import OptionsMenu, { type MenuOption } from '@/components/common/OptionsMenu.vue';
import ImageLightbox from '@/components/common/ImageLightbox.vue';
import { runWithConcurrency } from '@/utils/concurrency'; // Assuming this exists based on HomeView logic or I'll check it. Actually HomeView has it inline.
import { buildContentDetailPath } from '@/utils/contentLinks';
import { isAdminUser } from '@/utils/roles';
import LotteryTicketsModal from '@/components/admin/LotteryTicketsModal.vue';

const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const AVATAR_PUBLIC_BASE_URL = 'https://bot.cdelu.io';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const profileStore = useProfileStore();
const storageStore = useStorageStore();
const feedStore = useFeedStore();

const loadingProfile = ref(false);
const profileError = ref<string | null>(null);
const currentProfile = ref<PublicProfile | null>(null);
const viewedUserId = ref('');
const following = ref(false);
const followPending = ref(false);
const followError = ref<string | null>(null);

const form = ref({
  nombre: '',
  username: '',
  bio: '',
  location: '',
  website: '',
  profilePictureUrl: ''
});

const saving = ref(false);
const saveError = ref<string | null>(null);
const saveSuccess = ref<string | null>(null);
const checkingUsername = ref(false);
const usernameStatus = ref<'idle' | 'same' | 'available' | 'taken' | 'invalid'>('idle');
let usernameCheckTimer: ReturnType<typeof setTimeout> | null = null;

const selectedAvatarFile = ref<File | null>(null);
const avatarPreviewUrl = ref('');
const avatarUploading = ref(false);
const avatarUploadProgress = ref(0);
const linkingProviderId = ref<string | null>(null);
const linkProviderError = ref<string | null>(null);
const linkProviderSuccess = ref<string | null>(null);

const lotteriesParticipated = ref<number | null>(null);
const lotteriesWon = ref<number | null>(null);
const loadingStats = ref(false);

const formatCreationDate = (value: any): string => {
  if (!value) return '-';
  
  let dateObj: Date | null = null;
  if (value instanceof Date) {
    dateObj = value;
  } else if (typeof value?.toDate === 'function') {
    dateObj = value.toDate();
  } else if (typeof value === 'object' && value.seconds) {
    dateObj = new Date(value.seconds * 1000);
  } else if (typeof value === 'string' || typeof value === 'number') {
    dateObj = new Date(value);
  }
  
  if (!dateObj || Number.isNaN(dateObj.getTime())) return '-';
  
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(dateObj);
};

const userParticipations = ref<Array<{
  lotteryId: string;
  title: string;
  numbers: number[];
  isWinner: boolean;
  winningNumber: number | null;
  status: string;
  imageUrl: string;
  description: string;
}>>([]);

const userWins = ref<Array<{
  lotteryId: string;
  title: string;
  winningNumber: number | null;
  status: string;
  imageUrl: string;
  description: string;
}>>([]);

const showParticipatedModal = ref(false);
const showWinsModal = ref(false);

const loadLotteryStats = async (uid: string) => {
  if (!uid) return;
  loadingStats.value = true;
  try {
    const participatedQuery = query(
      collectionGroup(db, 'entries'),
      where('userId', '==', uid)
    );
    const participatedSnap = await getDocs(participatedQuery);
    
    const uniqueLotteryIds = new Set<string>();
    participatedSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data?.lotteryId) {
        uniqueLotteryIds.add(data.lotteryId);
      }
    });
    lotteriesParticipated.value = uniqueLotteryIds.size;

    const lotterySnaps = await Promise.all(
      Array.from(uniqueLotteryIds).map(id => getDoc(doc(db, 'lotteries', id)))
    );
    const lotteriesMap = new Map<string, any>();
    lotterySnaps.forEach(snap => {
      if (snap.exists()) {
        lotteriesMap.set(snap.id, snap.data());
      }
    });

    const groupedNumbers = new Map<string, number[]>();
    participatedSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data?.lotteryId && typeof data?.selectedNumber === 'number') {
        const nums = groupedNumbers.get(data.lotteryId) || [];
        nums.push(data.selectedNumber);
        groupedNumbers.set(data.lotteryId, nums);
      }
    });

    const tempParticipations: any[] = [];
    groupedNumbers.forEach((numbers, lotteryId) => {
      const lotteryData = lotteriesMap.get(lotteryId) || {};
      const winnerUserId = lotteryData.winner?.userId;
      const winnerNumber = lotteryData.winner?.selectedNumber;
      const isWinner = winnerUserId === uid && typeof winnerNumber === 'number' && numbers.includes(winnerNumber);

      let premioText = '';
      if (lotteryData.hasPremio !== false) {
        if (lotteryData.premioType === 'dinero') {
          premioText = typeof lotteryData.premioDinero === 'number' ? `Premio: $${lotteryData.premioDinero}` : 'Premio en Dinero';
        } else {
          premioText = lotteryData.premioOtros ? `Premio: ${lotteryData.premioOtros}` : 'Premio Especial';
        }
      } else {
        premioText = lotteryData.description || '';
      }

      tempParticipations.push({
        lotteryId,
        title: lotteryData.title || lotteryData.nombre || `Lotería #${lotteryId.slice(0, 6)}`,
        numbers: numbers.sort((a, b) => a - b),
        isWinner,
        winningNumber: typeof winnerNumber === 'number' ? winnerNumber : null,
        status: lotteryData.status || 'active',
        imageUrl: lotteryData.imageUrl || '',
        description: premioText
      });
    });
    userParticipations.value = tempParticipations;

    const winsQuery = query(
      collection(db, 'lotteries'),
      where('winner.userId', '==', uid)
    );
    const winsSnap = await getDocs(winsQuery);
    lotteriesWon.value = winsSnap.size;

    userWins.value = winsSnap.docs.map(docSnap => {
      const lotteryData = docSnap.data();
      let premioText = '';
      if (lotteryData.hasPremio !== false) {
        if (lotteryData.premioType === 'dinero') {
          premioText = typeof lotteryData.premioDinero === 'number' ? `Premio: $${lotteryData.premioDinero}` : 'Premio en Dinero';
        } else {
          premioText = lotteryData.premioOtros ? `Premio: ${lotteryData.premioOtros}` : 'Premio Especial';
        }
      } else {
        premioText = lotteryData.description || '';
      }

      return {
        lotteryId: docSnap.id,
        title: lotteryData.title || lotteryData.nombre || `Lotería #${docSnap.id.slice(0, 6)}`,
        winningNumber: lotteryData.winner?.selectedNumber || null,
        status: lotteryData.status || 'completed',
        imageUrl: lotteryData.imageUrl || '',
        description: premioText
      };
    });
  } catch (e) {
    console.error('Error fetching lottery stats:', e);
    lotteriesParticipated.value = 0;
    lotteriesWon.value = 0;
    userParticipations.value = [];
    userWins.value = [];
  } finally {
    loadingStats.value = false;
  }
};

const MAX_POST_IMAGES = 4;
const editingPosts = ref<Record<string, { 
  titulo: string; 
  descripcion: string; 
  saving: boolean;
  existingImages: Array<{ url: string; thumbUrl: string; path?: string; thumbPath?: string; width?: number; height?: number; sizeBytes?: number }>;
  newImages: Array<{ id: string; file: File; previewUrl: string }>;
  uploadProgress: number;
  error: string | null;
}>>({});

const lightboxOpen = ref(false);
const lightboxImages = ref<string[]>([]);
const lightboxStartIndex = ref(0);

const isOwnProfile = computed(() => {
  return Boolean(authStore.user?.uid) && viewedUserId.value === authStore.user?.uid;
});

const socialProvidersStatus = computed(() => {
  const knownProviders = [
    { id: 'google.com', label: 'Google' },
    { id: 'facebook.com', label: 'Facebook' }
  ];
  const providerIds = new Set(
    (authStore.user?.providerData || [])
      .map((provider: any) => (typeof provider?.providerId === 'string' ? provider.providerId : ''))
      .filter(Boolean)
  );

  return knownProviders.map((provider) => ({
    ...provider,
    connected: providerIds.has(provider.id)
  }));
});

const posts = computed(() => profileStore.getPostsForUser(viewedUserId.value));
const hasMorePosts = computed(() => profileStore.hasMorePostsForUser(viewedUserId.value));
const loadingPosts = computed(() => profileStore.isLoadingPostsForUser(viewedUserId.value));

const usernameHint = computed(() => {
  if (!isOwnProfile.value) return '';
  if (checkingUsername.value) return 'Verificando disponibilidad de username...';

  if (usernameStatus.value === 'same') {
    return 'Tu username actual.';
  }
  if (usernameStatus.value === 'available') {
    return 'Username disponible.';
  }
  if (usernameStatus.value === 'taken') {
    return 'Ese username ya esta en uso.';
  }
  if (usernameStatus.value === 'invalid') {
    return 'Usa entre 3 y 30 caracteres: a-z, 0-9 y _. ';
  }
  return 'Tu perfil publico se abrira con /perfil/:username.';
});

const canSave = computed(() => {
  if (!isOwnProfile.value || saving.value || avatarUploading.value) return false;

  const nombre = form.value.nombre.trim();
  const username = profileStore.normalizeUsernameInput(form.value.username);
  if (!nombre) return false;
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return false;
  if (usernameStatus.value === 'taken' || usernameStatus.value === 'invalid') return false;
  return true;
});

const linkSocialProvider = async (providerId: string) => {
  if (!isOwnProfile.value || linkingProviderId.value) return;
  linkingProviderId.value = providerId;
  linkProviderError.value = null;
  linkProviderSuccess.value = null;

  try {
    const result = await authStore.linkProvider(providerId);
    if (!result.success) {
      throw new Error(result.error || 'No se pudo vincular la cuenta.');
    }

    linkProviderSuccess.value = 'Cuenta social vinculada correctamente.';
  } catch (err: any) {
    linkProviderError.value = err?.message || 'No se pudo vincular la cuenta social.';
  } finally {
    linkingProviderId.value = null;
  }
};

const deriveThumbnailURL = (image: string, source?: string): string => {
  let derivedThumb = image;
  if (!image || typeof image !== 'string') return derivedThumb;
  // Solo aplicamos el guión bajo de miniatura generada vía Nodejs a los posts scrapeados.
  if (source !== 'scraping') return derivedThumb;
  if (image.includes('firebasestorage.googleapis.com')) return derivedThumb;
  
  try {
    const urlObj = new URL(image);
    const path = urlObj.pathname;
    const lastDotIndex = path.lastIndexOf('.');
    if (lastDotIndex > 0 && !path.slice(0, lastDotIndex).endsWith('_')) {
      urlObj.pathname = path.slice(0, lastDotIndex) + '_' + path.slice(lastDotIndex);
      derivedThumb = urlObj.toString();
    }
  } catch (e) {
    const match = image.match(/(.*)(\.[a-zA-Z0-9]+)(\?.*)?$/);
    if (match && !match[1].endsWith('_')) {
      derivedThumb = `${match[1]}_${match[2]}${match[3] || ''}`;
    }
  }
  return derivedThumb;
};

const normalizePublicImageUrl = (value: string): string => {
  const image = typeof value === 'string' ? value.trim() : '';
  if (!image) return image;

  return image
    .replace(/^https:\/\/cdelu\.ar\/imagenes\//i, 'https://bot.cdelu.io/images/')
    .replace(/^https:\/\/bot\.cdelu\.io\/images\//i, 'https://bot.cdelu.io/images/');
};

const normalizeImageList = (item: any): Array<{ url: string; thumbUrl: string }> => {
  if (Array.isArray(item?.imagesV2) && item.imagesV2.length > 0) {
    return item.imagesV2
      .filter((image: any) => image && typeof image.url === 'string')
      .map((image: any) => {
        const normalizedUrl = normalizePublicImageUrl(image.url);
        let finalThumbUrl = normalizedUrl;
        if (typeof image.thumbUrl === 'string' && image.thumbUrl.trim()) {
          finalThumbUrl = normalizePublicImageUrl(image.thumbUrl);
        }
        
        if (finalThumbUrl === normalizedUrl) {
          finalThumbUrl = normalizePublicImageUrl(deriveThumbnailURL(normalizedUrl, item.source));
        }

        return {
          url: normalizedUrl,
          thumbUrl: finalThumbUrl
        };
      });
  }

  if (Array.isArray(item?.images) && item.images.length > 0) {
    return item.images
      .filter((image: any) => typeof image === 'string' && image.trim().length > 0)
      .map((image: string) => {
        const normalizedUrl = normalizePublicImageUrl(image);
        return { url: normalizedUrl, thumbUrl: normalizePublicImageUrl(deriveThumbnailURL(normalizedUrl, item.source)) };
      });
  }

  return [];
};

const formatDate = (date: any) => {
  if (!date) return '';
  const parsed = date.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
};

const isAdmin = computed(() => {
  const rol = authStore.userProfile?.rol;
  const email = authStore.user?.email || authStore.userProfile?.email;
  const uid = authStore.user?.uid;
  return authStore.isAuthenticated && isAdminUser(rol, email, uid, authStore.tokenClaims);
});

const showGrantTicketsModal = ref(false);

const openGrantTicketsModal = () => {
  if (!isAdmin.value || isOwnProfile.value || !viewedUserId.value) return;
  showGrantTicketsModal.value = true;
};

const closeGrantTicketsModal = () => {
  showGrantTicketsModal.value = false;
};
const getPostMenuOptions = (post: any): MenuOption[] => {
  const isOwner = authStore.user?.uid === post.userId;
  const options: MenuOption[] = [];
  
  if (isOwner || isAdmin.value) {
    if (post.type === 'post') {
      options.push({ id: 'edit', label: 'Editar' });
    }
    options.push({ 
      id: 'delete', 
      label: 'Eliminar', 
      danger: true,
      requiresConfirm: true,
      confirmTitle: 'Eliminar publicación',
      confirmMsg: '¿Seguro que deseas eliminar esta publicación? Esta acción no se puede deshacer.',
      confirmButtonText: 'Eliminar'
    });
  }
  return options;
};

const handlePostMenuAction = async (actionId: string, post: any) => {
  if (actionId === 'delete') {
    try {
      await feedStore.deletePost(post.id);
      await profileStore.loadUserPosts(post.userId, true);
    } catch (e: any) {
      console.error('Error deleting post:', e);
    }
  } else if (actionId === 'edit') {
    editingPosts.value[post.id] = {
      titulo: post.titulo || '',
      descripcion: post.descripcion || '',
      saving: false,
      existingImages: post.imagesV2?.length ? [...post.imagesV2] : (post.images?.length ? post.images.map((url: string) => ({url, thumbUrl: url})) : []),
      newImages: [],
      uploadProgress: 0,
      error: null
    };
  }
};

const handleEditFileSelect = (event: Event, postId: string) => {
  const target = event.target as HTMLTextAreaElement | HTMLInputElement
  const files = (target as HTMLInputElement).files ? Array.from((target as HTMLInputElement).files!) : []
  if (files.length === 0) return

  const editData = editingPosts.value[postId]
  editData.error = null
  const currentTotal = editData.existingImages.length + editData.newImages.length
  const remaining = MAX_POST_IMAGES - currentTotal
  
  if (remaining <= 0) {
    editData.error = `Maximo ${MAX_POST_IMAGES} imagenes por publicacion.`
    target.value = ''
    return
  }

  const nextFiles = files.slice(0, remaining)
  for (const file of nextFiles) {
    const err = validateImageFile(file)
    if (err) {
      editData.error = err
      continue
    }
    editData.newImages.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file)
    })
  }
  target.value = ''
}

const removeEditExistingImage = (postId: string, index: number) => {
  editingPosts.value[postId].existingImages.splice(index, 1)
}

const removeEditNewImage = (postId: string, index: number) => {
  const image = editingPosts.value[postId].newImages[index]
  URL.revokeObjectURL(image.previewUrl)
  editingPosts.value[postId].newImages.splice(index, 1)
}

const cancelEditPost = (postId: string) => {
  const editData = editingPosts.value[postId]
  if (editData) {
    editData.newImages.forEach(img => URL.revokeObjectURL(img.previewUrl))
    delete editingPosts.value[postId]
  }
};

const autoResizeTextarea = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  target.style.height = 'auto';
  target.style.height = `${target.scrollHeight}px`;
};


const saveEditPost = async (post: any) => {
  const editData = editingPosts.value[post.id];
  if (!editData || !editData.descripcion.trim()) return;

  editData.saving = true;
  editData.error = null;

  try {
    const uploadTasks = editData.newImages.map((selectedImage, index) => async () => {
      try {
        const processed = await processImageForPost(selectedImage.file)
        const prefix = `posts/${authStore.user?.uid}/${Date.now()}_e${index}_${selectedImage.id}`
        const originalPath = `${prefix}_o.${processed.optimizedFile.type === 'image/webp' ? 'webp' : 'jpg'}`
        const thumbPath = `${prefix}_t.${processed.thumbFile.type === 'image/webp' ? 'webp' : 'jpg'}`
        
        const [mainUpload, thumbUpload] = await Promise.all([
          storageStore.uploadFileWithProgress(processed.optimizedFile, originalPath, () => {}),
          storageStore.uploadFileWithProgress(processed.thumbFile, thumbPath, () => {})
        ])
        
        return {
          url: mainUpload.url,
          thumbUrl: thumbUpload.url,
          path: mainUpload.path,
          thumbPath: thumbUpload.path,
          width: processed.width,
          height: processed.height,
          sizeBytes: mainUpload.sizeBytes
        }
      } catch {
        return null
      }
    })

    const uploadedNewImages = uploadTasks.length > 0 ? await runWithConcurrency(uploadTasks, 2) : []
    const validNewImages = uploadedNewImages.filter(Boolean) as any[]

    if (editData.newImages.length > 0 && validNewImages.length < editData.newImages.length) {
      editData.error = `Algunas imagenes no se pudieron subir.`
    }

    const combinedImages = [...editData.existingImages, ...validNewImages]

    await feedStore.editPost(post.id, editData.titulo.trim(), editData.descripcion.trim(), combinedImages, combinedImages.map(img => img.url));
    await profileStore.loadUserPosts(post.userId, true);
    
    editData.newImages.forEach(img => URL.revokeObjectURL(img.previewUrl))
    delete editingPosts.value[post.id];
  } catch (e: any) {
    console.error('Error saving post edit:', e);
    editData.saving = false;
    editData.error = e.message || 'No se pudo editar.'
  }
};

const clearAvatarPreview = () => {
  if (avatarPreviewUrl.value) {
    URL.revokeObjectURL(avatarPreviewUrl.value);
  }
  avatarPreviewUrl.value = '';
  selectedAvatarFile.value = null;
};

const resetFormFromProfile = () => {
  if (!currentProfile.value) return;

  form.value = {
    nombre: currentProfile.value.nombre || '',
    username: currentProfile.value.username || '',
    bio: currentProfile.value.bio || '',
    location: currentProfile.value.location || '',
    website: currentProfile.value.website || '',
    profilePictureUrl: currentProfile.value.profilePictureUrl || ''
  };

  saveError.value = null;
  saveSuccess.value = null;
  usernameStatus.value = 'same';
  clearAvatarPreview();
};

const ensureCurrentProfile = async (usernameParam?: string) => {
  if (usernameParam) {
    const candidate = usernameParam.trim();
    if (!candidate) {
      return null;
    }

    const publicProfile = await profileStore.getPublicProfileByUsername(candidate);
    return publicProfile;
  }

  if (!authStore.user?.uid) {
    return null;
  }

  await authStore.refreshUserProfile(authStore.user.uid);
  if (authStore.userProfile) {
    profileStore.cacheFromAnyProfile(authStore.userProfile, authStore.user.uid);
    return profileStore.getCachedProfile(authStore.user.uid);
  }

  return profileStore.getPublicProfileByUid(authStore.user.uid, true);
};

const syncFollowState = async () => {
  if (!viewedUserId.value || isOwnProfile.value || !authStore.user?.uid) {
    following.value = false;
    followError.value = null;
    return;
  }

  followError.value = null;
  following.value = await profileStore.isFollowingUser(viewedUserId.value);
};

const loadProfileContext = async () => {
  loadingProfile.value = true;
  profileError.value = null;
  followError.value = null;

  try {
    const usernameParam = typeof route.params.username === 'string'
      ? route.params.username
      : '';

    if (!usernameParam && !authStore.user?.uid) {
      router.push('/login');
      return;
    }

    const profile = await ensureCurrentProfile(usernameParam);
    if (!profile) {
      profileError.value = 'No encontramos ese perfil.';
      currentProfile.value = null;
      viewedUserId.value = '';
      return;
    }

    if (profile.rol === 'Sistema-no-user') {
      profileError.value = 'Este perfil no está disponible.';
      currentProfile.value = null;
      viewedUserId.value = '';
      router.push('/');
      return;
    }

    currentProfile.value = profile;
    viewedUserId.value = profile.userId;
    void loadLotteryStats(profile.userId);

    if (isOwnProfile.value) {
      resetFormFromProfile();
    }

    await profileStore.loadUserPosts(viewedUserId.value, true);
    await syncFollowState();
  } catch (err: any) {
    console.error('Error loading profile:', err);
    profileError.value = err?.message || 'No se pudo cargar el perfil.';
  } finally {
    loadingProfile.value = false;
  }
};

const checkUsernameAvailability = async () => {
  if (!isOwnProfile.value || !authStore.user?.uid) return;

  const normalized = profileStore.normalizeUsernameInput(form.value.username);
  if (!/^[a-z0-9_]{3,30}$/.test(normalized)) {
    usernameStatus.value = 'invalid';
    return;
  }

  if (normalized === (currentProfile.value?.usernameLower || '')) {
    usernameStatus.value = 'same';
    return;
  }

  checkingUsername.value = true;
  try {
    const availability = await profileStore.checkUsernameAvailability(
      normalized,
      authStore.user.uid
    );
    usernameStatus.value = availability.available ? 'available' : 'taken';
  } finally {
    checkingUsername.value = false;
  }
};

const handleAvatarSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const validationError = validateImageFile(file);
  if (validationError) {
    saveError.value = validationError;
    target.value = '';
    return;
  }

  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    saveError.value = 'El avatar no puede superar 2 MB.';
    target.value = '';
    return;
  }

  saveError.value = null;
  clearAvatarPreview();
  selectedAvatarFile.value = file;
  avatarPreviewUrl.value = URL.createObjectURL(file);
  target.value = '';
};

const handleSaveProfile = async () => {
  if (!canSave.value || !authStore.user?.uid) return;

  saving.value = true;
  saveError.value = null;
  saveSuccess.value = null;

  try {
    const normalizedUsername = profileStore.normalizeUsernameInput(form.value.username);
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      throw new Error('El username no es valido.');
    }

    if (usernameStatus.value === 'taken') {
      throw new Error('Ese username ya esta en uso.');
    }

    let profilePictureUrl = form.value.profilePictureUrl.trim();

    if (selectedAvatarFile.value) {
      avatarUploading.value = true;
      avatarUploadProgress.value = 0;

      const processed = await processImageForPost(selectedAvatarFile.value);
      const extension = processed.thumbFile.type === 'image/webp' ? 'webp' : 'jpg';
      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const path = `AVATAR/${authStore.user.uid}/${year}/${month}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_t.${extension}`;

      const uploadResult = await storageStore.uploadFileWithProgress(
        processed.thumbFile,
        path,
        (progress) => {
          avatarUploadProgress.value = Math.round(progress);
        }
      );

      const uploadedPath = String(uploadResult.path || '').trim().replace(/^\/+/, '');
      profilePictureUrl = uploadedPath
        ? `${AVATAR_PUBLIC_BASE_URL}/${uploadedPath}`
        : String(uploadResult.url || '').trim();
      avatarUploading.value = false;
    }

    await profileStore.updateMyProfile({
      nombre: form.value.nombre.trim(),
      username: normalizedUsername,
      bio: form.value.bio.trim(),
      location: form.value.location.trim(),
      website: form.value.website.trim(),
      profilePictureUrl
    });

    const refreshed = await profileStore.getPublicProfileByUid(authStore.user.uid, true);
    if (refreshed) {
      currentProfile.value = refreshed;
      viewedUserId.value = refreshed.userId;
      resetFormFromProfile();
    }

    await authStore.refreshUserProfile(authStore.user.uid);
    saveSuccess.value = 'Perfil actualizado correctamente.';

    if (typeof route.params.username === 'string' && route.params.username.trim()) {
      await router.replace(`/perfil/${normalizedUsername}`);
    }
  } catch (err: any) {
    console.error('Error saving profile:', err);
    saveError.value = err?.message || 'No se pudo guardar el perfil.';
  } finally {
    saving.value = false;
    avatarUploading.value = false;
    avatarUploadProgress.value = 0;
  }
};

const toggleFollow = async () => {
  if (!currentProfile.value || isOwnProfile.value || followPending.value) return;

  if (!authStore.user?.uid) {
    router.push('/login');
    return;
  }

  const wasFollowing = following.value;
  const previousCount = currentProfile.value.stats.followersCount;
  const nextFollowing = !wasFollowing;

  following.value = nextFollowing;
  currentProfile.value = {
    ...currentProfile.value,
    stats: {
      ...currentProfile.value.stats,
      followersCount: Math.max(0, previousCount + (nextFollowing ? 1 : -1))
    }
  };

  followPending.value = true;
  followError.value = null;

  try {
    if (nextFollowing) {
      await profileStore.followUser(currentProfile.value.userId);
    } else {
      await profileStore.unfollowUser(currentProfile.value.userId);
    }
  } catch (err: any) {
    following.value = wasFollowing;
    currentProfile.value = {
      ...currentProfile.value,
      stats: {
        ...currentProfile.value.stats,
        followersCount: previousCount
      }
    };
    followError.value = err?.message || 'No se pudo actualizar el seguimiento.';
  } finally {
    followPending.value = false;
  }
};

const openLightbox = (images: string[], startIndex: number = 0) => {
  const validImages = (images || []).filter((image) => typeof image === 'string' && image.trim().length > 0);
  if (validImages.length === 0) return;

  lightboxImages.value = validImages;
  lightboxStartIndex.value = Math.max(0, Math.min(startIndex, validImages.length - 1));
  lightboxOpen.value = true;
};

const closeLightbox = () => {
  lightboxOpen.value = false;
};

const loadMorePosts = async () => {
  if (!viewedUserId.value || loadingPosts.value || !hasMorePosts.value) return;
  await profileStore.loadUserPosts(viewedUserId.value);
};

const resolveContentModule = (item: any): 'news' | 'community' | null => {
  const moduleName = item?.module;
  if (moduleName === 'news' || moduleName === 'community') return moduleName;
  if (item?.type === 'news') return 'news';
  if (item?.type === 'post') return 'community';
  return null;
};

const getDetailPath = (item: any): string | null => {
  const moduleName = resolveContentModule(item);
  if (!moduleName) return null;
  return buildContentDetailPath(moduleName, {
    id: item.id,
    publicId: item.publicId,
    postId: item.postId,
    custom_fields: item.custom_fields,
    slug: item.slug,
    titulo: item.titulo || item.id
  });
};

const openDetailFromItem = async (item: any, hash: string = '') => {
  const path = getDetailPath(item);
  if (!path) return;
  await router.push(hash ? `${path}${hash}` : path);
};

watch(
  () => route.fullPath,
  () => {
    void loadProfileContext();
  }
);

watch(
  () => form.value.username,
  () => {
    if (!isOwnProfile.value) return;

    if (usernameCheckTimer) {
      clearTimeout(usernameCheckTimer);
      usernameCheckTimer = null;
    }

    usernameCheckTimer = setTimeout(() => {
      void checkUsernameAvailability();
    }, 350);
  }
);

onMounted(() => {
  void loadProfileContext();
});

onBeforeUnmount(() => {
  if (usernameCheckTimer) {
    clearTimeout(usernameCheckTimer);
    usernameCheckTimer = null;
  }
  clearAvatarPreview();
});
</script>

<template>
  <section class="profile-page">
    <div v-if="loadingProfile" class="state-card">
      <h2>Cargando perfil...</h2>
      <p>Estamos preparando tu informacion.</p>
    </div>

    <div v-else-if="profileError" class="state-card error">
      <h2>No pudimos cargar el perfil</h2>
      <p>{{ profileError }}</p>
    </div>

    <template v-else-if="currentProfile">
      <header class="profile-hero card">
        <div class="avatar-wrap">
          <img
            v-if="avatarPreviewUrl || currentProfile.profilePictureUrl"
            :src="avatarPreviewUrl || currentProfile.profilePictureUrl"
            class="avatar"
            alt="Avatar"
          />
          <div v-else class="avatar placeholder">
            {{ currentProfile.nombre.charAt(0) || 'U' }}
          </div>
        </div>

        <div class="profile-meta">
          <div class="title-row">
            <h1>{{ currentProfile.nombre }}</h1>
            <span class="username">@{{ currentProfile.username }}</span>
          </div>

          <p v-if="currentProfile.bio" class="bio">{{ currentProfile.bio }}</p>
          <p v-if="currentProfile.location || currentProfile.website" class="secondary">
            <span v-if="currentProfile.location">{{ currentProfile.location }}</span>
            <a
              v-if="currentProfile.website"
              :href="currentProfile.website"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ currentProfile.website }}
            </a>
          </p>

          <p class="secondary profile-joined-date">
            <span class="joined-icon">📅</span> Miembro desde el {{ formatCreationDate(currentProfile.createdAt) }}
          </p>

          <div class="stats-row">
            <span><strong>{{ currentProfile.stats.postsCount }}</strong> publicaciones</span>
            <span><strong>{{ currentProfile.stats.followersCount }}</strong> seguidores</span>
            <span><strong>{{ currentProfile.stats.followingCount }}</strong> siguiendo</span>
          </div>

          <div class="lottery-stats-container">
            <button
              class="lottery-stat-badge participated clickable"
              title="Ver loterías participadas"
              @click="showParticipatedModal = true"
            >
              <span class="stat-icon">🎟️</span>
              <div class="stat-info">
                <span class="stat-value">{{ lotteriesParticipated !== null ? lotteriesParticipated : '...' }}</span>
                <span class="stat-label">Loterías Participadas</span>
              </div>
            </button>
            <button
              class="lottery-stat-badge won clickable"
              title="Ver loterías ganadas"
              @click="showWinsModal = true"
            >
              <span class="stat-icon">🏆</span>
              <div class="stat-info">
                <span class="stat-value">{{ lotteriesWon !== null ? lotteriesWon : '...' }}</span>
                <span class="stat-label">Loterías Ganadas</span>
              </div>
            </button>
          </div>

          <div v-if="!isOwnProfile" class="actions-row">
            <button
              class="primary-btn"
              :disabled="followPending"
              @click="toggleFollow"
            >
              {{ followPending ? 'Actualizando...' : (following ? 'Siguiendo' : 'Seguir') }}
            </button>
            <button
              v-if="isAdmin"
              class="secondary-btn"
              @click="openGrantTicketsModal"
            >
              Agregar tickets loteria
            </button>
            <p v-if="followError" class="inline-error">{{ followError }}</p>

          </div>
        </div>
      </header>

      <section v-if="isOwnProfile" class="card profile-editor">
        <h2>Mi Perfil</h2>
        <p class="secondary">Edita tu perfil publico. Los cambios se reflejan en tus publicaciones y comentarios.</p>

        <div class="social-connected">
          <h3>Cuentas sociales vinculadas</h3>
          <p class="social-subtitle">
            Vincula tus cuentas para verificar tu identidad y participar en las loterías gratuitas 🎁.
          </p>
          <div class="social-connected-list">
            <div
              v-for="provider in socialProvidersStatus"
              :key="provider.id"
              class="social-card"
              :class="{ connected: provider.connected }"
            >
              <div class="social-card-left">
                <span class="social-icon-wrapper">
                  <svg v-if="provider.id === 'google.com'" class="social-svg-icon" viewBox="0 0 24 24" width="20" height="20">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <svg v-else-if="provider.id === 'facebook.com'" class="social-svg-icon fb" viewBox="0 0 24 24" width="20" height="20" fill="#1877F2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </span>
                <div class="social-info">
                  <span class="social-name">{{ provider.label }}</span>
                  <span class="social-status-label" :class="{ connected: provider.connected }">
                    {{ provider.connected ? 'Vinculado ✅' : 'No vinculado' }}
                  </span>
                </div>
              </div>
              <div class="social-card-right">
                <span v-if="provider.connected" class="social-status-pill connected">
                  Verificado ✅
                </span>
                <button
                  v-else
                  class="social-action-btn"
                  :disabled="Boolean(linkingProviderId)"
                  @click="linkSocialProvider(provider.id)"
                >
                  <span v-if="linkingProviderId === provider.id">Vinculando...</span>
                  <span v-else>Vincular</span>
                </button>
              </div>
            </div>
          </div>
          <p v-if="linkProviderError" class="inline-error">{{ linkProviderError }}</p>
          <p v-if="linkProviderSuccess" class="inline-success">{{ linkProviderSuccess }}</p>
        </div>

        <label class="avatar-upload">
          <span>Foto de perfil</span>
          <input type="file" accept="image/*" @change="handleAvatarSelect" />
          <small v-if="avatarUploading">Subiendo avatar {{ avatarUploadProgress }}%</small>
        </label>

        <div class="form-grid">
          <label>
            Nombre
            <input v-model="form.nombre" type="text" maxlength="120" />
          </label>

          <label>
            Username
            <input v-model="form.username" type="text" maxlength="30" />
            <small>{{ usernameHint }}</small>
          </label>

          <label>
            Ubicacion
            <input v-model="form.location" type="text" maxlength="120" />
          </label>

          <label>
            Sitio web
            <input v-model="form.website" type="text" maxlength="240" placeholder="https://..." />
          </label>
        </div>

        <label>
          Bio
          <textarea v-model="form.bio" maxlength="280" rows="4"></textarea>
        </label>

        <p v-if="saveError" class="inline-error">{{ saveError }}</p>
        <p v-if="saveSuccess" class="inline-success">{{ saveSuccess }}</p>

        <div class="editor-actions">
          <button class="primary-btn" :disabled="!canSave" @click="handleSaveProfile">
            {{ saving ? 'Guardando...' : 'Guardar cambios' }}
          </button>
        </div>

        <hr class="editor-divider" />

        <div class="danger-zone">
          <h3>Eliminar cuenta y datos</h3>
          <p class="secondary">
            Si deseas eliminar permanentemente tu cuenta de Cdelu.ar, tu perfil y toda la información asociada, puedes realizar la solicitud correspondiente de acuerdo con las políticas de Google Play Store.
          </p>
          <router-link to="/eliminar-datos" class="danger-zone-btn">
            Solicitar eliminación de cuenta y datos
          </router-link>
        </div>
      </section>

      <section class="card profile-posts">
        <h2>Publicaciones</h2>

        <div v-if="posts.length === 0 && !loadingPosts" class="empty-posts">
          <p>Este perfil aun no tiene publicaciones.</p>
        </div>

        <article v-for="post in posts" :key="post.id" class="post-card">
          <template v-if="editingPosts[post.id]">
            <header class="post-header">
              <div class="header-left">
                <h3 style="margin-bottom: 0.5rem">Editar Publicación</h3>
              </div>
            </header>
            <div class="inline-editor" style="display: flex; flex-direction: column; gap: 0.75rem;">
              <label>
                Título
                <input v-model="editingPosts[post.id].titulo" type="text" placeholder="Título (opcional)" :disabled="editingPosts[post.id].saving" />
              </label>
              <label>
                Descripción
                <textarea v-model="editingPosts[post.id].descripcion" rows="3" placeholder="Escribe tu publicación..." :disabled="editingPosts[post.id].saving" class="inline-editor-textarea" @input="autoResizeTextarea"></textarea>
              </label>

              <div v-if="editingPosts[post.id].existingImages.length > 0 || editingPosts[post.id].newImages.length > 0" class="image-preview-grid">
                <div v-for="(image, index) in editingPosts[post.id].existingImages" :key="'ex_'+index" class="preview-thumb-btn">
                  <img :src="image.thumbUrl" class="preview-img" style="opacity: 0.8" />
                  <span class="preview-remove" @click="removeEditExistingImage(post.id, index)">x</span>
                </div>
                <div v-for="(image, index) in editingPosts[post.id].newImages" :key="'new_'+image.id" class="preview-thumb-btn">
                  <img :src="image.previewUrl" class="preview-img" />
                  <span class="preview-remove" @click="removeEditNewImage(post.id, index)">x</span>
                </div>
                <div class="preview-counter">{{ editingPosts[post.id].existingImages.length + editingPosts[post.id].newImages.length }} / {{ MAX_POST_IMAGES }}</div>
              </div>

              <p v-if="editingPosts[post.id].error" class="composer-error">{{ editingPosts[post.id].error }}</p>

              <div class="editor-actions" style="display: flex; gap: 0.5rem; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                <div>
                  <label class="icon-btn" :class="{ disabled: (editingPosts[post.id].existingImages.length + editingPosts[post.id].newImages.length) >= MAX_POST_IMAGES }" style="background: var(--social-bg); padding: 0.5rem 0.8rem; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; font-weight: 600;">
                    <input
                      type="file"
                      multiple
                      @change="(e) => handleEditFileSelect(e, post.id)"
                      accept="image/*"
                      hidden
                      :disabled="(editingPosts[post.id].existingImages.length + editingPosts[post.id].newImages.length) >= MAX_POST_IMAGES"
                    />
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    <span>Fotos</span>
                  </label>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                  <button class="secondary-btn" @click="cancelEditPost(post.id)" :disabled="editingPosts[post.id].saving" style="font-size: 0.9rem;">Cancelar</button>
                  <button class="primary-btn" @click="saveEditPost(post)" :disabled="editingPosts[post.id].saving || !editingPosts[post.id].descripcion.trim()" :style="{ opacity: (editingPosts[post.id].saving || !editingPosts[post.id].descripcion.trim()) ? 0.6 : 1 }" style="font-size: 0.9rem;">
                    {{ editingPosts[post.id].saving ? 'Guardando...' : 'Confirmar' }}
                  </button>
                </div>
              </div>
            </div>
          </template>
          
          <template v-else>
            <header class="post-header">
              <div class="header-left">
                <span class="post-date">{{ formatDate(post.createdAt) }}</span>
              </div>
              <div class="post-header-actions">
                <OptionsMenu
                  v-if="getPostMenuOptions(post).length > 0"
                  :options="getPostMenuOptions(post)"
                  @action="handlePostMenuAction($event, post)"
                />
              </div>
            </header>

            <div class="post-content">
              <h3 v-if="post.titulo?.trim()">
                <button
                  v-if="getDetailPath(post)"
                  type="button"
                  class="title-link-btn"
                  @click="openDetailFromItem(post)"
                >
                  {{ post.titulo }}
                </button>
                <template v-else>{{ post.titulo }}</template>
              </h3>

              <div v-if="normalizeImageList(post).length > 0" 
                   class="post-images" 
                   :class="{ 'has-carousel': normalizeImageList(post).length > 2, 'single-img': normalizeImageList(post).length === 1 }">
                <button
                  v-for="(image, imageIndex) in normalizeImageList(post)"
                  :key="`${post.id}_${imageIndex}`"
                  class="post-image-btn"
                  type="button"
                  @click="openLightbox(normalizeImageList(post).map((entry) => entry.url), Number(imageIndex))"
                >
                  <img :src="image.thumbUrl" class="main-image" loading="lazy" @error="(e) => { const tgt = e.target as HTMLImageElement; if (tgt.src !== image.url) tgt.src = image.url; }" />
                </button>
              </div>

              <p style="white-space: pre-wrap; margin-top: 0.5rem;">{{ post.descripcion }}</p>
            </div>
          </template>
        </article>

        <button
          v-if="hasMorePosts"
          class="secondary-btn"
          :disabled="loadingPosts"
          @click="loadMorePosts"
        >
          {{ loadingPosts ? 'Cargando...' : 'Ver mas publicaciones' }}
        </button>
      </section>
    </template>
  </section>
  
  
  <LotteryTicketsModal
    :open="showGrantTicketsModal"
    :user-id="viewedUserId"
    :username="currentProfile?.username || ''"
    @close="closeGrantTicketsModal"
  />
  <ImageLightbox
    :open="lightboxOpen"
    :images="lightboxImages"
    :initial-index="lightboxStartIndex"
    @close="closeLightbox"
  />

  <!-- Modal Loterías Participadas -->
  <div v-if="showParticipatedModal" class="custom-modal-overlay" @click.self="showParticipatedModal = false">
    <div class="custom-modal-content card premium-modal">
      <div class="modal-header">
        <h2>Loterías Participadas 🎟️</h2>
        <button class="close-modal-btn" @click="showParticipatedModal = false">×</button>
      </div>
      
      <div class="modal-scroll-area">
        <div v-if="loadingStats" class="modal-loading">
          Cargando participaciones...
        </div>
        <div v-else-if="userParticipations.length === 0" class="modal-empty-state">
          <span class="empty-icon">🎟️</span>
          <p>Aún no has participado en ninguna lotería.</p>
        </div>
        <div v-else class="participations-list">
          <div v-for="part in userParticipations" :key="part.lotteryId" class="participation-card">
            <div class="part-main-info">
              <img v-if="part.imageUrl" :src="part.imageUrl" class="part-img" />
              <div class="part-text">
                <h4 class="part-title">{{ part.title }}</h4>
                <p class="part-desc" v-if="part.description">{{ part.description }}</p>
                <div class="part-numbers">
                  <span class="numbers-label">Tus números:</span>
                  <span v-for="num in part.numbers" :key="num" class="number-tag">
                    #{{ num }}
                  </span>
                </div>
              </div>
            </div>
            <div class="part-status-badge" :class="part.status">
              <span v-if="part.isWinner" class="winner-label">🏆 ¡Ganaste!</span>
              <span v-else-if="part.status === 'completed'" class="ended-label">Finalizada</span>
              <span v-else class="active-label">Activa</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal Loterías Ganadas -->
  <div v-if="showWinsModal" class="custom-modal-overlay" @click.self="showWinsModal = false">
    <div class="custom-modal-content card premium-modal wins-modal">
      <div class="modal-header">
        <h2>Loterías Ganadas 🏆</h2>
        <button class="close-modal-btn" @click="showWinsModal = false">×</button>
      </div>
      
      <div class="modal-scroll-area">
        <div v-if="loadingStats" class="modal-loading">
          Cargando victorias...
        </div>
        <div v-else-if="userWins.length === 0" class="modal-empty-state">
          <span class="empty-icon">🏆</span>
          <p>Aún no has ganado ninguna lotería. ¡Sigue participando para tener más oportunidades! 🍀</p>
        </div>
        <div v-else class="participations-list">
          <div v-for="win in userWins" :key="win.lotteryId" class="participation-card win-card">
            <div class="part-main-info">
              <img v-if="win.imageUrl" :src="win.imageUrl" class="part-img" />
              <div class="part-text">
                <h4 class="part-title">{{ win.title }}</h4>
                <p class="part-desc" v-if="win.description">{{ win.description }}</p>
                <div class="win-number-row">
                  <span class="win-label">Número ganador:</span>
                  <span class="win-number-tag">#{{ win.winningNumber }}</span>
                </div>
              </div>
            </div>
            <div class="part-status-badge won">
              <span class="winner-label">🏆 Premio</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 820px;
  margin: 0 auto;
  padding: 1.2rem 1rem 2rem;
  display: grid;
  gap: 1rem;
}

.card,
.state-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 1.1rem;
}

.state-card h2,
.state-card p {
  margin: 0;
}

.state-card p {
  margin-top: 0.45rem;
  color: var(--text);
}

.state-card.error {
  border-color: #fca5a5;
}

.profile-hero {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
}

.avatar-wrap {
  width: 94px;
  height: 94px;
}

.avatar {
  width: 100%;
  height: 100%;
  border-radius: 18px;
  object-fit: cover;
  display: block;
}

.avatar.placeholder {
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.4rem;
}

.profile-meta h1 {
  margin: 0;
  font-size: 1.3rem;
  color: var(--text-h);
}

.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.55rem;
}

.username {
  color: var(--text);
  font-weight: 600;
  font-size: 0.95rem;
}

.bio,
.secondary {
  margin: 0.4rem 0 0;
  color: var(--text);
}

.secondary a {
  color: var(--accent);
  text-decoration: none;
}

.stats-row {
  margin-top: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  color: var(--text);
  font-size: 0.92rem;
}

.stats-row strong {
  color: var(--text-h);
}

.profile-joined-date {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.86rem;
  color: var(--text);
  opacity: 0.85;
  margin-top: 0.45rem;
}

.joined-icon {
  font-size: 0.95rem;
}

.lottery-stats-container {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-top: 1.1rem;
  width: 100%;
}

.lottery-stat-badge {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.8rem 1rem;
  border-radius: 16px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border);
  transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.015);
}

.lottery-stat-badge:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.03);
}

.lottery-stat-badge.participated {
  border-color: color-mix(in srgb, var(--accent) 25%, var(--border) 75%);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 3%, var(--card-bg) 97%),
    color-mix(in srgb, var(--accent) 7%, var(--card-bg) 93%)
  );
}

.lottery-stat-badge.participated:hover {
  border-color: var(--accent);
}

.lottery-stat-badge.won {
  border-color: rgba(16, 185, 129, 0.2);
  background: linear-gradient(
    135deg,
    rgba(16, 185, 129, 0.02),
    rgba(16, 185, 129, 0.05)
  );
}

.lottery-stat-badge.won:hover {
  border-color: #10b981;
}

.stat-icon {
  font-size: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.05));
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-h);
  line-height: 1.2;
}

.stat-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.2px;
}

.actions-row {
  margin-top: 0.8rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
}

.primary-btn,
.secondary-btn {
  border: 0;
  border-radius: 999px;
  padding: 0.55rem 1rem;
  cursor: pointer;
  font-weight: 700;
}

.primary-btn {
  background: var(--accent);
  color: #fff;
}

.primary-btn:disabled,
.secondary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.secondary-btn {
  background: var(--social-bg);
  color: var(--text-h);
  border: 1px solid var(--border);
}

.profile-editor h2,
.profile-posts h2 {
  margin: 0;
  color: var(--text-h);
}

/* --- NUEVOS ESTILOS PARA SOCIAL CONNECTED --- */
.social-connected {
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
  padding: 1.25rem;
  border-radius: 20px;
  background: var(--social-bg, rgba(249, 250, 251, 0.03));
  border: 1px solid var(--border);
}

.social-connected h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-h);
}

.social-subtitle {
  margin: 0.35rem 0 1rem;
  font-size: 0.85rem;
  color: var(--text);
  line-height: 1.4;
}

.social-connected-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.75rem;
}

.social-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.2rem;
  border-radius: 16px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.01);
}

.social-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
}

.social-card.connected {
  background: rgba(16, 185, 129, 0.03);
  border-color: rgba(16, 185, 129, 0.2);
}

.social-card.connected:hover {
  border-color: rgba(16, 185, 129, 0.4);
}

.social-card-left {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.social-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--social-bg, #f3f4f6);
  border: 1px solid var(--border);
}

.social-svg-icon {
  display: block;
}

.social-svg-icon.fb {
  color: #1877F2;
}

.social-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.social-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-h);
}

.social-status-label {
  font-size: 0.78rem;
  color: var(--text);
  font-weight: 500;
  white-space: nowrap;
}

.social-status-label.connected {
  color: #10b981;
  font-weight: 600;
}

.social-status-pill {
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.35rem 0.75rem;
  border-radius: 99px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.social-status-pill.connected {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.social-action-btn {
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 99px;
  padding: 0.45rem 1.1rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.social-action-btn:hover {
  background: var(--accent-hover, #0284c7);
  transform: scale(1.03);
}

.social-action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  margin-top: 0.75rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--text-h);
  font-weight: 600;
  font-size: 0.9rem;
}

input,
textarea {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.55rem 0.65rem;
  font: inherit;
  color: var(--text-h);
  background: var(--input-bg);
}

textarea {
  resize: vertical;
  margin-top: 0.75rem;
}

label small {
  color: var(--text);
  font-weight: 500;
}

.avatar-upload {
  margin-top: 0.75rem;
}

.inline-error,
.inline-success {
  margin: 0.55rem 0 0;
  font-size: 0.86rem;
}

.inline-error {
  color: #b91c1c;
}

.inline-success {
  color: #166534;
}

.editor-actions {
  margin-top: 0.9rem;
}

.profile-posts {
  display: grid;
  gap: 0.85rem;
}

.post-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.8rem;
  background: var(--bg);
}

.post-card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
}

.post-card h3 {
  margin: 0;
  color: var(--text-h);
  font-size: 1rem;
}

.post-date {
  color: var(--text);
  font-size: 0.8rem;
  font-weight: 600;
}

.post-card p {
  margin: 0.55rem 0 0;
  color: var(--text);
  white-space: pre-wrap;
}

.post-images {
  margin-top: 0.65rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.45rem;
}

.post-images img {
  width: 100%;
  height: 150px;
  object-fit: cover;
  border-radius: 10px;
  display: block;
}

.empty-posts {
  border: 1px dashed var(--border);
  border-radius: 12px;
  padding: 1rem;
  color: var(--text);
}

@media (max-width: 700px) {
  .profile-hero {
    grid-template-columns: 1fr;
  }

  .avatar-wrap {
    width: 78px;
    height: 78px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .profile-page {
    padding: 1rem 0;
    gap: 1rem;
  }

  .profile-hero, 
  .profile-stats,
  .profile-editor,
  .profile-posts header {
    padding: 0 1rem;
  }

  .profile-hero {
    grid-template-columns: 1fr;
    text-align: center;
    justify-items: center;
  }

  .avatar-wrap {
    width: 110px;
    height: 110px;
  }

  .title-row {
    justify-content: center;
  }

  .stats-row {
    justify-content: center;
  }

  .lottery-stats-container {
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }

  .actions-row {
    align-items: center;
    width: 100%;
  }

  .primary-btn, .secondary-btn {
    width: 100%;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .post-card {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    padding: 1rem;
    margin-bottom: 0.8rem;
  }

  .post-images {
    grid-template-columns: repeat(2, 1fr);
  }

  .post-images.single-img .main-image {
    max-height: 380px;
    height: auto;
    border-radius: 0;
  }

  .post-images.has-carousel {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    gap: 0.6rem;
    padding: 0 1rem 0.5rem;
    width: calc(100% + 2rem);
    margin-left: -1rem;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .post-images.has-carousel::-webkit-scrollbar {
    display: none;
  }

  .post-images.has-carousel .post-image-btn {
    flex: 0 0 82%;
    scroll-snap-align: center;
    border-radius: 12px;
  }
}
.post-image-btn {
  border: 0;
  border-radius: 12px;
  padding: 0;
  margin: 0;
  overflow: hidden;
  cursor: zoom-in;
  background: transparent;
}

.main-image {
  width: 100%;
  display: block;
  height: 250px;
  object-fit: cover;
  transition: opacity 0.2s;
}

.post-images.single-img {
  display: flex;
  justify-content: center;
}

.post-images.single-img .post-image-btn {
  width: 100%;
  max-width: 500px;
}

.post-images.single-img .main-image {
  height: auto;
  max-height: 450px;
  border-radius: 12px;
}

/* --- ESTILOS DE MODALES PREMIUM --- */
.custom-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 15, 30, 0.75);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 1rem;
  animation: fadeIn 0.25s ease-out;
}

.premium-modal {
  width: 100%;
  max-width: 580px;
  background: linear-gradient(135deg, var(--card-bg), color-mix(in srgb, var(--card-bg) 92%, #111827 8%));
  border: 1px solid var(--border);
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.45);
  border-radius: 24px;
  overflow: hidden;
  padding: 1.5rem !important;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 80vh;
  animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.85rem;
}

.modal-header h2 {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text-h);
  margin: 0;
}

.close-modal-btn {
  background: transparent;
  border: 0;
  color: var(--text);
  font-size: 1.8rem;
  cursor: pointer;
  line-height: 1;
  transition: color 0.2s;
  padding: 0 0.5rem;
}

.close-modal-btn:hover {
  color: var(--accent);
}

.modal-scroll-area {
  overflow-y: auto;
  max-height: 60vh;
  padding-right: 0.4rem;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.modal-scroll-area::-webkit-scrollbar {
  width: 5px;
}

.modal-scroll-area::-webkit-scrollbar-thumb {
  background-color: var(--border);
  border-radius: 99px;
}

.modal-loading {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--text);
  font-size: 0.95rem;
}

.modal-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
  text-align: center;
  color: var(--text);
  gap: 0.75rem;
}

.empty-icon {
  font-size: 2.8rem;
}

.modal-empty-state p {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 500;
  opacity: 0.85;
}

.participations-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding-bottom: 0.5rem;
}

.participation-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1.1rem;
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid var(--border);
  border-radius: 18px;
  transition: all 0.22s ease;
}

.participation-card:hover {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border) 70%);
  background: rgba(255, 255, 255, 0.03);
}

.part-main-info {
  display: flex;
  align-items: center;
  gap: 0.95rem;
  flex: 1;
}

.part-img {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid var(--border);
}

.part-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.part-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-h);
}

.part-desc {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text);
  opacity: 0.8;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.part-numbers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.15rem;
}

.numbers-label {
  font-size: 0.76rem;
  color: var(--text);
  opacity: 0.7;
  font-weight: 500;
}

.number-tag {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
}

.part-status-badge {
  flex-shrink: 0;
  padding: 0.25rem 0.65rem;
  border-radius: 99px;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.part-status-badge.active {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.part-status-badge.completed {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  opacity: 0.8;
}

.part-status-badge.won,
.winner-label {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.win-number-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.15rem;
}

.win-label {
  font-size: 0.76rem;
  color: #10b981;
  font-weight: 600;
}

.win-number-tag {
  font-size: 0.76rem;
  font-weight: 800;
  color: #fff;
  background: #10b981;
  padding: 0.1rem 0.5rem;
  border-radius: 6px;
}

.lottery-stat-badge.clickable {
  cursor: pointer;
  border: 1px solid var(--border);
  text-align: left;
  font-family: inherit;
  width: 100%;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleUp {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.editor-divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 2rem 0 1.5rem;
}

.danger-zone {
  background: color-mix(in srgb, var(--card-bg) 95%, #ef4444 5%);
  border: 1px solid color-mix(in srgb, var(--border) 80%, #ef4444 20%);
  padding: 1.5rem;
  border-radius: 14px;
}

.danger-zone h3 {
  color: #ef4444;
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  font-weight: 700;
}

.danger-zone p {
  margin: 0 0 1.2rem;
  font-size: 0.88rem;
  line-height: 1.5;
  opacity: 0.85;
}

.danger-zone-btn {
  display: inline-block;
  background: #ef4444;
  color: #fff;
  border: none;
  padding: 0.65rem 1.2rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.88rem;
  text-decoration: none;
  text-align: center;
  transition: transform 0.2s, opacity 0.2s;
}

.danger-zone-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}
</style>
