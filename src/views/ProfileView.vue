<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore, type PublicProfile } from '@/stores/profileStore';
import { useStorageStore } from '@/stores/storageStore';
import { useFeedStore } from '@/stores/feedStore';
import { processImageForPost, validateImageFile } from '@/utils/imageProcessing';
import OptionsMenu, { type MenuOption } from '@/components/common/OptionsMenu.vue';
import ImageLightbox from '@/components/common/ImageLightbox.vue';
import { runWithConcurrency } from '@/utils/concurrency'; // Assuming this exists based on HomeView logic or I'll check it. Actually HomeView has it inline.
import { buildContentDetailPath } from '@/utils/contentLinks';

const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;

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

const normalizeImageList = (item: any): Array<{ url: string; thumbUrl: string }> => {
  if (Array.isArray(item?.imagesV2) && item.imagesV2.length > 0) {
    return item.imagesV2
      .filter((image: any) => image && typeof image.url === 'string')
      .map((image: any) => ({
        url: image.url,
        thumbUrl:
          typeof image.thumbUrl === 'string' && image.thumbUrl.trim()
            ? image.thumbUrl
            : image.url
      }));
  }

  if (Array.isArray(item?.images) && item.images.length > 0) {
    return item.images
      .filter((image: any) => typeof image === 'string' && image.trim().length > 0)
      .map((image: string) => ({ url: image, thumbUrl: image }));
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

const isAdmin = computed(() => authStore.userProfile?.rol === 'admin');

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
      titulo: post.titulo === 'Nueva Publicacion' ? '' : (post.titulo || ''),
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

    await feedStore.editPost(post.id, editData.titulo.trim() || 'Nueva Publicacion', editData.descripcion.trim(), combinedImages, combinedImages.map(img => img.url));
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

    currentProfile.value = profile;
    viewedUserId.value = profile.userId;

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
      const path = `avatars/${authStore.user.uid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_t.${extension}`;

      const uploadResult = await storageStore.uploadFileWithProgress(
        processed.thumbFile,
        path,
        (progress) => {
          avatarUploadProgress.value = Math.round(progress);
        }
      );

      profilePictureUrl = uploadResult.url;
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

          <div class="stats-row">
            <span><strong>{{ currentProfile.stats.postsCount }}</strong> publicaciones</span>
            <span><strong>{{ currentProfile.stats.followersCount }}</strong> seguidores</span>
            <span><strong>{{ currentProfile.stats.followingCount }}</strong> siguiendo</span>
          </div>

          <div v-if="!isOwnProfile" class="actions-row">
            <button
              class="primary-btn"
              :disabled="followPending"
              @click="toggleFollow"
            >
              {{ followPending ? 'Actualizando...' : (following ? 'Siguiendo' : 'Seguir') }}
            </button>
            <p v-if="followError" class="inline-error">{{ followError }}</p>
          </div>
        </div>
      </header>

      <section v-if="isOwnProfile" class="card profile-editor">
        <h2>Mi Perfil</h2>
        <p class="secondary">Edita tu perfil publico. Los cambios se reflejan en tus publicaciones y comentarios.</p>

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
              <h3 v-if="post.titulo && post.titulo !== 'Nueva Publicacion'">
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
                  <img :src="image.thumbUrl" class="main-image" loading="lazy" />
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
  
  <ImageLightbox
    :open="lightboxOpen"
    :images="lightboxImages"
    :initial-index="lightboxStartIndex"
    @close="closeLightbox"
  />
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
</style>