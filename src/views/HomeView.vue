<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { useHeaderScroll } from '@/composables/useHeaderScroll'
import { useFeedStore } from '@/stores/feedStore'
import { useAuthStore } from '@/stores/authStore'
import { useStorageStore } from '@/stores/storageStore'
import { useSurveyStore } from '@/stores/surveyStore'
import { useLotteryStore } from '@/stores/lotteryStore'
import { useCommentStore } from '@/stores/commentStore'
import { useLikesStore } from '@/stores/likesStore'
import { useProfileStore } from '@/stores/profileStore'

import FeedAdItem from '@/components/feed/FeedAdItem.vue'
import ImageLightbox from '@/components/common/ImageLightbox.vue'
import AuthPromptModal from '@/components/common/AuthPromptModal.vue'
import ExpandableText from '@/components/common/ExpandableText.vue'
import SurveySection from '@/components/surveys/SurveySection.vue'
import LotterySection from '@/components/lottery/LotterySection.vue'
import CommentSection from '@/components/comments/CommentSection.vue'
import CommentPreviewList from '@/components/comments/CommentPreviewList.vue'
import { db } from '@/config/firebase'
import {
  buildContentDetailPath,
  buildContentDetailPathByValues,
  normalizeContentSlug,
  normalizeNewsPublicRef,
  type ContentModuleKey
} from '@/utils/contentLinks'
import {
  MAX_POST_IMAGES,
  processImageForPost,
  validateImageFile
} from '@/utils/imageProcessing'
import { runWithConcurrency } from '@/utils/concurrency'
import OptionsMenu, { type MenuOption } from '@/components/common/OptionsMenu.vue'

const { isVisible: isHeaderVisible } = useHeaderScroll()
const scrollY = ref(window.scrollY)
const handleScrollY = () => { scrollY.value = window.scrollY }

onMounted(() => {
  window.addEventListener('scroll', handleScrollY, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScrollY)
})

const feedStore = useFeedStore()
const authStore = useAuthStore()
const storageStore = useStorageStore()
const surveyStore = useSurveyStore()
const lotteryStore = useLotteryStore()
const commentStore = useCommentStore()
const likesStore = useLikesStore()
const profileStore = useProfileStore()
const router = useRouter()
const route = useRoute()

// Form state
const newPostTitle = ref('')
const newPostContent = ref('')
const selectedImages = ref<Array<{ id: string; file: File; previewUrl: string }>>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const composerError = ref<string | null>(null)
const createPostProgress = ref(0)
const creatingPost = ref(false)
const isExpanded = ref(false)
const lightboxOpen = ref(false)
const lightboxImages = ref<string[]>([])
const lightboxStartIndex = ref(0)
const infiniteSentinel = ref<HTMLElement | null>(null)
const editingPosts = ref<Record<string, { 
  titulo: string; 
  descripcion: string; 
  saving: boolean;
  existingImages: Array<{ url: string; thumbUrl: string; path?: string; thumbPath?: string; width?: number; height?: number; sizeBytes?: number }>;
  newImages: Array<{ id: string; file: File; previewUrl: string }>;
  uploadProgress: number;
  error: string | null;
}>>({})
const expandedComments = ref<Record<string, boolean>>({})
const showLikeLoginPrompt = ref(false)
const scrollPositions = ref<Record<string, number>>({})
const touchStartX = ref(0)
const touchStartY = ref(0)
const touchStartTime = ref(0)
const detailLoading = ref(false)
const detailNotFound = ref(false)
const detailTargetItem = ref<any | null>(null)
let infiniteObserver: IntersectionObserver | null = null

const shouldShowSurveysTab = computed(() => {
  if (!feedStore.isModuleEnabled('surveys')) return false
  if (surveyStore.featuredLoading) return true
  return Boolean(surveyStore.featuredSurvey)
})

const visibleTabs = computed(() =>
  feedStore.availableTabs.filter(
    (tab) => tab.key !== 'surveys' || shouldShowSurveysTab.value
  )
)

const detailModuleFromRoute = computed<ContentModuleKey | null>(() => {
  if (route.name === 'news-detail') return 'news'
  if (route.name === 'community-detail') return 'community'
  return null
})

const isDetailRoute = computed(() => detailModuleFromRoute.value !== null)
const detailRef = computed(() =>
  typeof route.params.ref === 'string' ? route.params.ref.trim() : ''
)
const detailSlugParam = computed(() =>
  typeof route.params.slug === 'string' ? route.params.slug.trim() : ''
)

const revokeSelectedImagePreviews = () => {
  for (const image of selectedImages.value) {
    URL.revokeObjectURL(image.previewUrl)
  }
}

const clearSelectedImages = () => {
  revokeSelectedImagePreviews()
  selectedImages.value = []
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const setupInfiniteObserver = async () => {
  await nextTick()

  if (infiniteObserver) {
    infiniteObserver.disconnect()
    infiniteObserver = null
  }

  if (!infiniteSentinel.value) return

  infiniteObserver = new IntersectionObserver(
    (entries) => {
      const isVisible = entries.some((entry) => entry.isIntersecting)
      if (!isVisible) return
      if (!feedStore.hasMore || feedStore.loading) return

      feedStore.loadMore()
    },
    {
      root: null,
      threshold: 0.01,
      rootMargin: '900px 0px 900px 0px'
    }
  )

  infiniteObserver.observe(infiniteSentinel.value)
}

const setActiveTab = async (tabKey: string) => {
  if (feedStore.currentTab === tabKey) return

  if (isDetailRoute.value) {
    await router.push('/')
  }

  // Save current scroll position
  scrollPositions.value[feedStore.currentTab] = window.scrollY

  feedStore.initFeed(tabKey)

  // Restore scroll position
  await nextTick()
  const savedPos = scrollPositions.value[tabKey] || 0
  
  // Pequeño delay adicional para asegurar que el contenido se renderice
  setTimeout(() => {
    window.scrollTo({
      top: savedPos,
      behavior: 'instant'
    })
  }, 0)
}

// Swipe detection logic
const handleTouchStart = (e: TouchEvent) => {
  touchStartX.value = e.touches[0].clientX
  touchStartY.value = e.touches[0].clientY
  touchStartTime.value = Date.now()
}

const handleTouchEnd = (e: TouchEvent) => {
  const deltaX = e.changedTouches[0].clientX - touchStartX.value
  const deltaY = e.changedTouches[0].clientY - touchStartY.value
  const deltaTime = Date.now() - touchStartTime.value

  // Thresholds
  const minSwipeDistance = 50
  const maxVerticalDistance = 100
  const maxTime = 300

  if (Math.abs(deltaX) > minSwipeDistance && 
      Math.abs(deltaY) < maxVerticalDistance && 
      deltaTime < maxTime) {
    
    const tabs = visibleTabs.value
    const currentIndex = tabs.findIndex(t => t.key === feedStore.currentTab)
    
    if (deltaX < 0 && currentIndex < tabs.length - 1) {
      // Swipe left -> Next tab
      setActiveTab(tabs[currentIndex + 1].key)
    } else if (deltaX > 0 && currentIndex > 0) {
      // Swipe right -> Previous tab
      setActiveTab(tabs[currentIndex - 1].key)
    }
  }
}

onMounted(async () => {
  const initialTab = detailModuleFromRoute.value
    ? getTargetTabForModule(detailModuleFromRoute.value)
    : 'todo'
  feedStore.initFeed(initialTab)
  surveyStore.initFeaturedSurveyListener()
  if (isDetailRoute.value) {
    await resolveDetailRoute()
  }
  await setupInfiniteObserver()
})

onUnmounted(() => {
  if (infiniteObserver) {
    infiniteObserver.disconnect()
    infiniteObserver = null
  }
  revokeSelectedImagePreviews()
  surveyStore.cleanupFeaturedSurvey()
  lotteryStore.cleanupPublicLotteries()
  feedStore.cleanup()
})

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  if (files.length === 0) return

  composerError.value = null
  const remaining = MAX_POST_IMAGES - selectedImages.value.length
  if (remaining <= 0) {
    composerError.value = `Maximo ${MAX_POST_IMAGES} imagenes por publicacion.`
    target.value = ''
    return
  }

  const nextFiles = files.slice(0, remaining)
  for (const file of nextFiles) {
    const validationError = validateImageFile(file)
    if (validationError) {
      composerError.value = validationError
      continue
    }

    selectedImages.value.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file)
    })
  }

  if (files.length > remaining) {
    composerError.value = `Solo se permiten ${MAX_POST_IMAGES} imagenes por publicacion.`
  }

  target.value = ''
}

const removeSelectedImage = (id: string) => {
  const index = selectedImages.value.findIndex((image) => image.id === id)
  if (index < 0) return

  URL.revokeObjectURL(selectedImages.value[index].previewUrl)
  selectedImages.value.splice(index, 1)
}

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
      }))
  }

  if (Array.isArray(item?.images) && item.images.length > 0) {
    return item.images
      .filter((image: any) => typeof image === 'string' && image.trim().length > 0)
      .map((image: string) => ({ url: image, thumbUrl: image }))
  }

  return []
}



const handleCreatePost = async () => {
  if (!newPostContent.value.trim()) return

  try {
    composerError.value = null
    createPostProgress.value = 0
    creatingPost.value = true

    if (!authStore.user?.uid) {
      throw new Error('No autenticado')
    }

    const totalUnits = selectedImages.value.length * 2
    const unitProgress = new Map<string, number>()
    const updateUnitProgress = (unitKey: string, progress: number) => {
      unitProgress.set(unitKey, progress)
      if (totalUnits === 0) {
        createPostProgress.value = 100
        return
      }

      const total = Array.from(unitProgress.values()).reduce((sum, value) => sum + value, 0)
      createPostProgress.value = Math.round(total / totalUnits)
    }

    const uploadErrors: string[] = []
    const uploadTasks = selectedImages.value.map((selectedImage, index) => async () => {
      try {
        const processed = await processImageForPost(selectedImage.file)
        const prefix = `posts/${authStore.user?.uid}/${Date.now()}_${index}_${selectedImage.id}`
        const originalPath = `${prefix}_o.${processed.optimizedFile.type === 'image/webp' ? 'webp' : 'jpg'}`
        const thumbPath = `${prefix}_t.${processed.thumbFile.type === 'image/webp' ? 'webp' : 'jpg'}`
        const mainUnit = `main_${selectedImage.id}`
        const thumbUnit = `thumb_${selectedImage.id}`

        updateUnitProgress(mainUnit, 0)
        updateUnitProgress(thumbUnit, 0)

        const [mainUpload, thumbUpload] = await Promise.all([
          storageStore.uploadFileWithProgress(
            processed.optimizedFile,
            originalPath,
            (progress) => updateUnitProgress(mainUnit, progress)
          ),
          storageStore.uploadFileWithProgress(
            processed.thumbFile,
            thumbPath,
            (progress) => updateUnitProgress(thumbUnit, progress)
          )
        ])

        updateUnitProgress(mainUnit, 100)
        updateUnitProgress(thumbUnit, 100)

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
        uploadErrors.push(selectedImage.file.name)
        return null
      }
    })

    const uploadedImages =
      uploadTasks.length > 0 ? await runWithConcurrency(uploadTasks, 2) : []
    const imagesV2 = uploadedImages.filter(Boolean) as Array<{
      url: string
      thumbUrl: string
      path: string
      thumbPath: string
      width: number
      height: number
      sizeBytes: number
    }>

    if (selectedImages.value.length > 0 && imagesV2.length === 0) {
      throw new Error('No se pudo subir ninguna imagen. Intenta nuevamente.')
    }

    if (uploadErrors.length > 0) {
      composerError.value = `Algunas imagenes fallaron (${uploadErrors.length}). Se publico con las restantes.`
    }

    await feedStore.createPost(
      newPostTitle.value || 'Nueva Publicación',
      newPostContent.value,
      imagesV2.map((image) => image.url),
      imagesV2
    )

    newPostTitle.value = ''
    newPostContent.value = ''
    clearSelectedImages()
    isExpanded.value = false
    createPostProgress.value = 0
  } catch (err) {
    console.error('Error al crear post:', err)
    composerError.value =
      err instanceof Error ? err.message : 'No se pudo publicar. Intenta nuevamente.'
  } finally {
    creatingPost.value = false
  }
}

const isAdmin = computed(() => authStore.userProfile?.rol === 'admin')

const getPostMenuOptions = (item: any): MenuOption[] => {
  const isOwner = authStore.user?.uid === item.userId
  const options: MenuOption[] = []
  
  if (isOwner || isAdmin.value) {
    if (item.type === 'post') {
      options.push({ id: 'edit', label: 'Editar' })
    }
    options.push({ 
      id: 'delete', 
      label: 'Eliminar', 
      danger: true,
      requiresConfirm: true,
      confirmTitle: 'Eliminar publicación',
      confirmMsg: '¿Seguro que deseas eliminar esta publicación? Esta acción no se puede deshacer.',
      confirmButtonText: 'Eliminar'
    })
  }
  return options
}

const handlePostMenuAction = async (actionId: string, item: any) => {
  if (actionId === 'delete') {
    try {
      await feedStore.deletePost(item.id)
    } catch (e: any) {
      console.error('Error deleting post:', e)
    }
  } else if (actionId === 'edit') {
    editingPosts.value[item.id] = {
      titulo: item.titulo === 'Nueva Publicacion' ? '' : (item.titulo || ''),
      descripcion: item.descripcion || '',
      saving: false,
      existingImages: item.imagesV2?.length ? [...item.imagesV2] : (item.images?.length ? item.images.map((url: string) => ({url, thumbUrl: url})) : []),
      newImages: [],
      uploadProgress: 0,
      error: null
    }
  }
}

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
}

const autoResizeTextarea = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  target.style.height = 'auto'
  target.style.height = `${target.scrollHeight}px`
}

const saveEditPost = async (item: any) => {
  const editData = editingPosts.value[item.id]
  if (!editData || !editData.descripcion.trim()) return

  editData.saving = true
  editData.error = null

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

    await feedStore.editPost(item.id, editData.titulo.trim() || 'Nueva Publicacion', editData.descripcion.trim(), combinedImages, combinedImages.map(img => img.url))
    
    editData.newImages.forEach(img => URL.revokeObjectURL(img.previewUrl))
    delete editingPosts.value[item.id]
  } catch (e: any) {
    console.error('Error saving post edit:', e)
    editData.saving = false
    editData.error = e.message || 'No se pudo editar.'
  }
}

const handleAdImpression = (item: any) => {
  feedStore.trackAdImpression(item)
}

const handleAdClick = (item: any) => {
  feedStore.trackAdClick(item)
}

const openUserProfile = async (item: any) => {
  const targetUserId = typeof item?.userId === 'string' ? item.userId.trim() : ''
  if (!targetUserId) return

  try {
    if (authStore.user?.uid === targetUserId) {
      await router.push('/perfil')
      return
    }

    const explicitUsername = typeof item?.userUsername === 'string'
      ? item.userUsername
      : (typeof item?.username === 'string' ? item.username : '')
    const normalizedUsername = profileStore.normalizeUsernameInput(explicitUsername || '')
    if (normalizedUsername) {
      await router.push(`/perfil/${normalizedUsername}`)
      return
    }

    const publicProfile = await profileStore.getPublicProfileByUid(targetUserId)
    if (publicProfile?.usernameLower) {
      await router.push(`/perfil/${publicProfile.usernameLower}`)
      return
    }

    await router.push(`/perfil/${targetUserId}`)
  } catch (error) {
    console.error('Error opening user profile:', error)
  }
}

const openLightbox = (images: string[], startIndex: number = 0) => {
  const validImages = (images || []).filter((image) => typeof image === 'string' && image.trim().length > 0)
  if (validImages.length === 0) return

  lightboxImages.value = validImages
  lightboxStartIndex.value = Math.max(0, Math.min(startIndex, validImages.length - 1))
  lightboxOpen.value = true
}

const closeLightbox = () => {
  lightboxOpen.value = false
}

const getTargetTabForModule = (moduleName: ContentModuleKey): 'news' | 'post' =>
  moduleName === 'news' ? 'news' : 'post'

const isAliveContent = (item: any): boolean => item?.deletedAt == null

const fetchContentDocById = async (contentId: string): Promise<any | null> => {
  const safeId = contentId.trim()
  if (!safeId) return null

  const snapshot = await getDoc(doc(db, 'content', safeId))
  if (!snapshot.exists()) return null

  return { id: snapshot.id, ...snapshot.data() }
}

const fetchContentDocByPublicId = async (
  moduleName: ContentModuleKey,
  publicRef: string
): Promise<any | null> => {
  const normalizedPublicId = normalizeNewsPublicRef(publicRef)
  if (!normalizedPublicId) return null

  try {
    const publicKey = `${moduleName}__${normalizedPublicId}`
    const publicSnapshot = await getDoc(doc(db, '_content_public_ids', publicKey))
    if (publicSnapshot.exists()) {
      const mappedContentId = String(publicSnapshot.data()?.contentId || '').trim()
      if (mappedContentId) {
        const mappedDoc = await fetchContentDocById(mappedContentId)
        if (mappedDoc) return mappedDoc
      }
    }
  } catch (error) {
    console.warn('Public ID index lookup failed, using fallback query', error)
  }

  const fallbackQuery = query(
    collection(db, 'content'),
    where('module', '==', moduleName),
    where('postId', '==', Number(normalizedPublicId)),
    where('deletedAt', '==', null),
    limit(1)
  )
  const fallbackSnapshot = await getDocs(fallbackQuery)
  if (fallbackSnapshot.empty) return null
  const fallbackDoc = fallbackSnapshot.docs[0]
  return { id: fallbackDoc.id, ...fallbackDoc.data() }
}

const extractNewsRefFromItem = (item: any): string => {
  const candidates = [
    item?.publicId,
    item?.postId,
    item?.custom_fields?.postId,
    item?.custom_fields?.postID,
    item?.custom_fields?.id,
    item?.custom_fields
  ]

  for (const candidate of candidates) {
    const normalized = normalizeNewsPublicRef(candidate)
    if (normalized) return normalized
  }

  return ''
}

const fetchContentDocBySlug = async (
  moduleName: ContentModuleKey,
  slug: string
): Promise<any | null> => {
  const normalizedSlug = normalizeContentSlug(slug)
  if (!normalizedSlug) return null

  const slugKey = `${moduleName}__${normalizedSlug}`
  const slugSnapshot = await getDoc(doc(db, '_content_slugs', slugKey))
  if (!slugSnapshot.exists()) return null

  const mappedContentId = String(slugSnapshot.data()?.contentId || '').trim()
  if (!mappedContentId) return null

  return fetchContentDocById(mappedContentId)
}

const resolveContentModule = (item: any): 'news' | 'community' | null => {
  const moduleName = item?.module
  if (moduleName === 'news' || moduleName === 'community') return moduleName
  if (item?.type === 'news') return 'news'
  if (item?.type === 'post') return 'community'
  return null
}

const isDetailTarget = (item: any): boolean =>
  isDetailRoute.value && Boolean(detailTargetItem.value) && detailTargetItem.value?.id === item?.id

const getDetailPath = (item: any): string | null => {
  const moduleName = resolveContentModule(item)
  if (!moduleName) return null
  return buildContentDetailPath(moduleName, {
    id: item.id,
    publicId: item.publicId,
    postId: item.postId,
    custom_fields: item.custom_fields,
    slug: item.slug,
    titulo: item.titulo || item.id
  })
}

const openDetailFromItem = async (item: any, hash: string = '') => {
  const path = getDetailPath(item)
  if (!path) return
  await router.push(hash ? `${path}${hash}` : path)
}

const buildDetailAbsoluteUrl = (item: any): string | null => {
  const path = getDetailPath(item)
  if (!path) return null
  return new URL(path, window.location.origin).toString()
}

const handleSharePost = async (item: any) => {
  const url = buildDetailAbsoluteUrl(item)
  if (!url) return

  try {
    if (navigator.share) {
      await navigator.share({
        title: item?.titulo || 'Publicacion',
        text: item?.descripcion || '',
        url
      })
      return
    }
  } catch (error) {
    console.error('Error sharing post:', error)
  }

  try {
    await navigator.clipboard.writeText(url)
  } catch (error) {
    console.error('Error copying post URL:', error)
  }
}

const clearDetailState = () => {
  detailLoading.value = false
  detailNotFound.value = false
  detailTargetItem.value = null
}

const resolveDetailRoute = async () => {
  const moduleName = detailModuleFromRoute.value
  if (!moduleName) {
    clearDetailState()
    return
  }

  const refValue = detailRef.value
  if (!refValue) {
    detailNotFound.value = true
    detailTargetItem.value = null
    return
  }

  const targetTab = getTargetTabForModule(moduleName)
  if (feedStore.currentTab !== targetTab) {
    feedStore.initFeed(targetTab)
  }

  detailLoading.value = true
  detailNotFound.value = false

  try {
    let found: any | null = null

    if (moduleName === 'news') {
      found = await fetchContentDocByPublicId(moduleName, refValue)
      if (!found) {
        found = await fetchContentDocById(refValue)
      }
    } else {
      found = await fetchContentDocById(refValue)
    }

    if (!found) {
      const slugCandidate = detailSlugParam.value || refValue
      found = await fetchContentDocBySlug(moduleName, slugCandidate)
    }

    const isValidModule = found && resolveContentModule(found) === moduleName
    if (!found || !isValidModule || !isAliveContent(found)) {
      detailTargetItem.value = null
      detailNotFound.value = true
      return
    }

    if (moduleName === 'news') {
      const newsPublicRef = extractNewsRefFromItem(found)
      if (!newsPublicRef) {
        // fallback temporal a id interno mientras se propaga postId/publicId
      }
    }

    detailTargetItem.value = found
    detailNotFound.value = false
    expandedComments.value = {
      ...expandedComments.value,
      [found.id]: true
    }

    const canonicalPath = buildContentDetailPathByValues(
      moduleName,
      moduleName === 'news'
        ? String(extractNewsRefFromItem(found) || found.id || '')
        : String(found.id || ''),
      found.slug || found.titulo || found.id
    )

    if (route.path !== canonicalPath) {
      await router.replace(canonicalPath)
    }
  } catch (error) {
    console.error('Error resolving detail route:', error)
    detailTargetItem.value = null
    detailNotFound.value = true
  } finally {
    detailLoading.value = false
  }
}

const displayFeedItems = computed(() => {
  const baseItems = feedStore.allItems || []
  if (!isDetailRoute.value || !detailTargetItem.value) {
    return baseItems
  }

  const deduped = baseItems.filter((item) => item.id !== detailTargetItem.value.id)
  return [detailTargetItem.value, ...deduped]
})

const isLikesEnabledForItem = (item: any): boolean => {
  const moduleName = resolveContentModule(item)
  if (!moduleName) return false
  return likesStore.isLikesEnabledForModule(moduleName)
}

const isLikePendingForItem = (item: any): boolean => likesStore.isLikePending(item.id)

const isLikedByMe = (item: any): boolean => likesStore.isLiked(item.id)

const getLikeErrorMessage = (item: any): string | null => likesStore.getLikeError(item.id)

const getLikesCount = (item: any): number => {
  const parsed = Number(item?.stats?.likesCount ?? 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed))
}

const primeVisibleLikes = async () => {
  if (!authStore.user?.uid) return

  const contentIds = displayFeedItems.value
    .filter((item) => !item.isAd && isLikesEnabledForItem(item))
    .map((item) => item.id)

  if (contentIds.length === 0) return
  await likesStore.primeLikesForContentIds(contentIds)
}

const handleToggleLike = async (item: any) => {
  if (!authStore.isAuthenticated) {
    showLikeLoginPrompt.value = true
    return
  }
  if (!isLikesEnabledForItem(item)) return
  if (likesStore.isLikePending(item.id)) return

  try {
    await likesStore.primeLikesForContentIds([item.id])
    const previousCount = getLikesCount(item)
    const wasLiked = likesStore.isLiked(item.id)
    const delta = wasLiked ? -1 : 1

    if (!item.stats || typeof item.stats !== 'object') {
      item.stats = {}
    }
    item.stats.likesCount = Math.max(0, previousCount + delta)

    try {
      await likesStore.toggleLikeOptimistic(item.id)
    } catch (error) {
      item.stats.likesCount = previousCount
      console.error('Error toggling like:', error)
    }
  } catch (error) {
    console.error('Error preparing like toggle:', error)
  }
}

const closeLikeLoginPrompt = () => {
  showLikeLoginPrompt.value = false
}

const canShowCommentsForItem = (item: any): boolean => {
  const moduleName = resolveContentModule(item)
  if (!moduleName) return false
  return feedStore.isCommentsEnabledForModule(moduleName)
}

const isCommentsOpen = (itemId: string) => Boolean(expandedComments.value[itemId])

const getCommentsCount = (item: any): number => {
  const parsed = Number(item?.stats?.commentsCount ?? 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed))
}

const getCommentsLabel = (item: any): string => {
  const backendCount = getCommentsCount(item)
  if (backendCount > 0) {
    return `Comentarios ${backendCount}`
  }

  const previewCount = commentStore.getPreviewComments(item.id).length
  if (previewCount > 0) {
    return 'Comentarios 1+'
  }

  return 'Comentarios'
}

const shouldShowCommentPreview = (item: any): boolean => {
  if (!canShowCommentsForItem(item)) return false
  if (isCommentsOpen(item.id)) return false
  return true
}

const toggleComments = (item: any) => {
  if (!canShowCommentsForItem(item)) return
  expandedComments.value = {
    ...expandedComments.value,
    [item.id]: !expandedComments.value[item.id]
  }
}

const handleHtmlImageClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (!(target instanceof HTMLImageElement)) return

  const container = event.currentTarget as HTMLElement | null
  const htmlImages = container
    ? Array.from(container.querySelectorAll('img'))
        .map((img) => img.getAttribute('src') || img.getAttribute('data-src') || '')
        .filter((src) => src.trim().length > 0)
    : []

  const clickedSrc = target.getAttribute('src') || target.currentSrc || target.src
  if (!clickedSrc) return

  if (htmlImages.length === 0) {
    openLightbox([clickedSrc], 0)
    return
  }

  const startIndex = Math.max(0, htmlImages.findIndex((src) => src === clickedSrc))
  openLightbox(htmlImages, startIndex)
}

const formatDate = (date: any) => {
  if (!date) return ''
  const d = date.toDate ? date.toDate() : new Date(date)
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d)
}

watch(
  () => authStore.user?.uid || '',
  () => {
    void primeVisibleLikes()
  },
  { immediate: true }
)

watch(
  () => displayFeedItems.value.map((item) => item.id).join('|'),
  () => {
    void primeVisibleLikes()
  }
)

watch(
  () => [feedStore.hasMore, feedStore.allItems.length],
  async () => {
    await setupInfiniteObserver()
  }
)

watch(
  () => [shouldShowSurveysTab.value, feedStore.currentTab],
  ([showSurveysTab, currentTab]) => {
    if (!showSurveysTab && currentTab === 'surveys') {
      feedStore.initFeed('todo')
    }
  }
)

watch(
  () => route.fullPath,
  () => {
    void resolveDetailRoute()
  }
)
</script>

<template>
  <div 
    class="home-view"
    @touchstart="handleTouchStart"
    @touchend="handleTouchEnd"
  >
    <div class="feed-container">
      <div 
        class="feed-tabs"
        :class="{ 
          'tabs-at-top': scrollY <= 64,
          'tabs-fixed-top': !isHeaderVisible && scrollY > 64,
          'tabs-hidden-up': isHeaderVisible && scrollY > 64
        }"
      >
        <button
          v-for="tab in visibleTabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: feedStore.currentTab === tab.key }"
          @click="setActiveTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

    <SurveySection
      v-if="feedStore.currentTab === 'todo' && feedStore.isModuleEnabled('surveys')"
      mode="featured"
    />

    <!-- Create Post Section -->
    <section
      v-if="
        authStore.isAuthenticated &&
        feedStore.isModuleEnabled('community') &&
        feedStore.currentTab !== 'news' &&
        feedStore.currentTab !== 'surveys' &&
        feedStore.currentTab !== 'lottery'
      "
      class="create-post-section"
    >
      <div class="create-card" :class="{ expanded: isExpanded }">
        <div v-if="!isExpanded" class="user-avatar">
          <img v-if="authStore.userProfile?.profilePictureUrl" :src="authStore.userProfile.profilePictureUrl" />
          <div v-else class="avatar-placeholder">{{ authStore.userProfile?.nombre?.charAt(0) }}</div>
        </div>

        <div v-if="isExpanded" class="composer-top">
          <div class="user-avatar">
            <img v-if="authStore.userProfile?.profilePictureUrl" :src="authStore.userProfile.profilePictureUrl" />
            <div v-else class="avatar-placeholder">{{ authStore.userProfile?.nombre?.charAt(0) }}</div>
          </div>
          <input 
            v-model="newPostTitle"
            type="text" 
            placeholder="Título (opcional)" 
            class="title-input-top"
          />
        </div>
        
        <div class="form-container">
          <textarea 
            v-model="newPostContent"
            placeholder="¿Qué estás pensando?" 
            class="content-input"
            @focus="isExpanded = true"
            :rows="isExpanded ? 4 : 1"
          ></textarea>

          <div v-if="selectedImages.length > 0" class="image-preview-grid">
            <button
              v-for="image in selectedImages"
              :key="image.id"
              class="preview-thumb-btn"
              type="button"
              @click="openLightbox(selectedImages.map((selected) => selected.previewUrl), selectedImages.findIndex((selected) => selected.id === image.id))"
            >
              <img :src="image.previewUrl" class="preview-img" />
              <span class="preview-remove" @click.stop="removeSelectedImage(image.id)">x</span>
            </button>
            <div class="preview-counter">{{ selectedImages.length }} / {{ MAX_POST_IMAGES }}</div>
          </div>

          <p v-if="composerError" class="composer-error">{{ composerError }}</p>

          <div v-if="isExpanded" class="form-footer">
            <div class="actions">
              <label class="icon-btn" :class="{ disabled: selectedImages.length >= MAX_POST_IMAGES }">
                <input
                  ref="fileInputRef"
                  type="file"
                  multiple
                  @change="handleFileSelect"
                  accept="image/*"
                  hidden
                  :disabled="selectedImages.length >= MAX_POST_IMAGES"
                />
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                <span>Imagenes</span>
              </label>
            </div>
            
            <div class="submit-group">
              <button @click="isExpanded = false" class="cancel-btn">Cancelar</button>
              <button 
                @click="handleCreatePost" 
                :disabled="!newPostContent.trim() || creatingPost"
                class="publish-btn"
              >
                {{ creatingPost ? `Publicando ${Math.round(createPostProgress)}%` : 'Publicar' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Feed List -->
    <SurveySection v-if="feedStore.currentTab === 'surveys'" />
    <LotterySection v-if="feedStore.currentTab === 'lottery'" />

    <div 
      v-if="feedStore.currentTab !== 'surveys' && feedStore.currentTab !== 'lottery' && feedStore.loading && displayFeedItems.length === 0" 
      class="loading-state"
    >
      <div class="spinner"></div>
      <p>Sincronizando con CdeluAR...</p>
    </div>

    <div
      v-else-if="feedStore.currentTab !== 'surveys' && feedStore.currentTab !== 'lottery' && displayFeedItems.length === 0"
      class="empty-state"
    >
      <div class="empty-icon">📭</div>
      <h3>No hay nada por aquí</h3>
      <p v-if="feedStore.currentTab !== 'news'">Sé el primero en compartir algo con la comunidad.</p>
      <p v-else>Aún no hay noticias oficiales.</p>
    </div>

    <div v-else-if="feedStore.currentTab !== 'surveys' && feedStore.currentTab !== 'lottery'" class="post-list">
      <div v-if="isDetailRoute && detailLoading" class="detail-info-card">
        Cargando publicacion...
      </div>
      <div v-else-if="isDetailRoute && detailNotFound" class="detail-info-card error">
        No encontramos esa publicacion. Mostramos el feed disponible.
      </div>

      <div v-for="item in displayFeedItems" :key="item.id">
        <FeedAdItem
          v-if="item.isAd"
          :item="item"
          @impression="handleAdImpression"
          @click-ad="handleAdClick"
        />

        <div v-else class="post-card" :id="isDetailTarget(item) ? 'titulo' : undefined">
          <template v-if="editingPosts[item.id]">
            <header class="post-header">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <h3 style="margin: 0; font-size: 1rem; color: var(--text-h)">Editar Publicación</h3>
              </div>
            </header>
            <div class="inline-editor" style="display: flex; flex-direction: column; gap: 0.75rem; padding-top: 0.5rem">
              <label style="display: flex; flex-direction: column; gap: 0.35rem; font-weight: 600; font-size: 0.9rem;">
                Título
                <input v-model="editingPosts[item.id].titulo" type="text" placeholder="Título (opcional)" :disabled="editingPosts[item.id].saving" style="border: 1px solid var(--border); border-radius: 10px; padding: 0.55rem 0.65rem; background: var(--input-bg); color: var(--text-h);" />
              </label>
              <label style="display: flex; flex-direction: column; gap: 0.35rem; font-weight: 600; font-size: 0.9rem;">
                Descripción
                <textarea v-model="editingPosts[item.id].descripcion" rows="3" placeholder="Escribe tu publicación..." :disabled="editingPosts[item.id].saving" class="inline-editor-textarea" @input="autoResizeTextarea"></textarea>
              </label>

              <div v-if="editingPosts[item.id].existingImages.length > 0 || editingPosts[item.id].newImages.length > 0" class="image-preview-grid">
                <div v-for="(image, index) in editingPosts[item.id].existingImages" :key="'ex_'+index" class="preview-thumb-btn">
                  <img :src="image.thumbUrl" class="preview-img" style="opacity: 0.8" />
                  <span class="preview-remove" @click="removeEditExistingImage(item.id, index)">x</span>
                </div>
                <div v-for="(image, index) in editingPosts[item.id].newImages" :key="'new_'+image.id" class="preview-thumb-btn">
                  <img :src="image.previewUrl" class="preview-img" />
                  <span class="preview-remove" @click="removeEditNewImage(item.id, index)">x</span>
                </div>
                <div class="preview-counter">{{ editingPosts[item.id].existingImages.length + editingPosts[item.id].newImages.length }} / {{ MAX_POST_IMAGES }}</div>
              </div>

              <p v-if="editingPosts[item.id].error" class="composer-error">{{ editingPosts[item.id].error }}</p>

              <div class="editor-actions" style="display: flex; gap: 0.5rem; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                <div>
                  <label class="icon-btn" :class="{ disabled: (editingPosts[item.id].existingImages.length + editingPosts[item.id].newImages.length) >= MAX_POST_IMAGES }" style="background: var(--social-bg); padding: 0.5rem 0.8rem; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; font-weight: 600;">
                    <input
                      type="file"
                      multiple
                      @change="(e) => handleEditFileSelect(e, item.id)"
                      accept="image/*"
                      hidden
                      :disabled="(editingPosts[item.id].existingImages.length + editingPosts[item.id].newImages.length) >= MAX_POST_IMAGES"
                    />
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    <span>Fotos</span>
                  </label>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                  <button class="cancel-btn" @click="cancelEditPost(item.id)" :disabled="editingPosts[item.id].saving">Cancelar</button>
                  <button class="publish-btn" @click="saveEditPost(item)" :disabled="editingPosts[item.id].saving || !editingPosts[item.id].descripcion.trim()" :style="{ opacity: (editingPosts[item.id].saving || !editingPosts[item.id].descripcion.trim()) ? 0.6 : 1 }">
                    {{ editingPosts[item.id].saving ? 'Guardando...' : 'Confirmar' }}
                  </button>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <header class="post-header">
              <button class="post-user post-user-btn" type="button" @click="openUserProfile(item)">
                <img v-if="item.userProfilePicUrl" :src="item.userProfilePicUrl" class="mini-avatar" />
                <div v-else class="mini-avatar-placeholder">{{ item.userName?.charAt(0) || 'U' }}</div>
                <div class="user-details">
                  <span class="user-name">{{ item.userName || 'Usuario' }}</span>
                  <span class="post-date">{{ formatDate(item.createdAt) }}</span>
                </div>
              </button>
              <div class="post-header-actions">
                <div v-if="item.type === 'news'" class="tag news">Noticia</div>
                <OptionsMenu
                  v-if="getPostMenuOptions(item).length > 0"
                  :options="getPostMenuOptions(item)"
                  @action="handlePostMenuAction($event, item)"
                />
              </div>
            </header>

            <div class="post-content">
              <h3 v-if="item.titulo && item.titulo !== 'Nueva Publicacion'">
                <button
                  v-if="getDetailPath(item)"
                  type="button"
                  class="title-link-btn"
                  @click="openDetailFromItem(item, '#titulo')"
                >
                  {{ item.titulo }}
                </button>
                <template v-else>{{ item.titulo }}</template>
              </h3>

              <div v-if="normalizeImageList(item).length > 0" 
                   class="post-images" 
                   :class="{ 'has-carousel': normalizeImageList(item).length > 2, 'single-img': normalizeImageList(item).length === 1 }">
                <button
                  v-for="(image, imageIndex) in normalizeImageList(item)"
                  :key="`${item.id}_${imageIndex}`"
                  class="post-image-btn"
                  type="button"
                  @click="openLightbox(normalizeImageList(item).map((entry) => entry.url), Number(imageIndex))"
                >
                  <img :src="image.thumbUrl" class="main-image" loading="lazy" />
                </button>
              </div>

              <ExpandableText
                v-if="item.isOficial"
                :html="item.descripcion || ''"
                :is-html="true"
                :max-preview-length="isDetailTarget(item) ? 200000 : 420"
                @content-click="handleHtmlImageClick"
              />
              <ExpandableText
                v-else
                :text="item.descripcion || ''"
                :max-preview-length="isDetailTarget(item) ? 200000 : 320"
              />
            </div>

        <footer class="post-footer">
          <button
            class="interaction-btn"
            :class="{ active: isLikedByMe(item) }"
            :disabled="!isLikesEnabledForItem(item) || isLikePendingForItem(item)"
            @click="handleToggleLike(item)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            <span>{{ getLikesCount(item) }}</span>
          </button>
          <button
            class="interaction-btn"
            :class="{ active: isCommentsOpen(item.id) }"
            :disabled="!canShowCommentsForItem(item)"
            @click="toggleComments(item)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-10.6 8.38 8.38 0 0 1 3.8.9L21 3z"></path></svg>
            <span>{{ getCommentsLabel(item) }}</span>
          </button>
          <button class="interaction-btn share" @click="handleSharePost(item)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </button>
          <button
            class="interaction-btn open-link"
            :disabled="!getDetailPath(item)"
            @click="openDetailFromItem(item)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L10.7 5.23"></path><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L13.3 18.77"></path></svg>
          </button>
        </footer>
        <p v-if="getLikeErrorMessage(item)" class="interaction-error">
          {{ getLikeErrorMessage(item) }}
        </p>

        <CommentPreviewList
          v-if="shouldShowCommentPreview(item) && resolveContentModule(item)"
          :content-id="item.id"
          :module="resolveContentModule(item) || 'community'"
          :limit="1"
        />

        <CommentSection
          v-if="isCommentsOpen(item.id) && canShowCommentsForItem(item) && resolveContentModule(item)"
          :content-id="item.id"
          :module="resolveContentModule(item) || 'community'"
        />
        </template>
        </div>
      </div>

      <div v-if="feedStore.hasMore" ref="infiniteSentinel" class="infinite-sentinel">
        <span v-if="!feedStore.loading">Ver más publicaciones</span>
        <span v-else>Desliza para seguir viendo</span>
      </div>
    </div>

    <ImageLightbox
      :open="lightboxOpen"
      :images="lightboxImages"
      :initial-index="lightboxStartIndex"
      @close="closeLightbox"
    />

    <AuthPromptModal
      :open="showLikeLoginPrompt"
      title="Inicia sesion para dar me gusta"
      message="Con tu cuenta puedes guardar tus likes y participar en la comunidad."
      @close="closeLikeLoginPrompt"
    />
    </div>
  </div>
</template>

<style scoped>
.feed-container {
  max-width: 680px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

/* Feed Tabs Sticky & Unified Refined */
.feed-tabs {
  display: flex;
  gap: 1.5rem;
  border-bottom: 1px solid var(--border);
  padding: 0 1.5rem;
  z-index: 999;
  background: var(--glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  height: var(--header-height);
  align-items: center;
  overflow-x: auto;
  flex-wrap: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  margin-bottom: 1.5rem;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.feed-tabs::after {
  content: '';
  flex: 0 0 1.5rem; /* Spacer to preserve right padding on scroll */
  height: 1px;
}

/* Estado normal: en el flujo del documento */
.tabs-at-top {
  position: relative;
  transform: none;
  opacity: 1;
}

/* Estado pegado: cuando el header principal se oculta */
.tabs-fixed-top {
  position: sticky;
  top: 0;
  transform: translateY(0);
  opacity: 1;
}

/* Estado oculto: cuando vuelves a subir y quieres ver el main-header */
.tabs-hidden-up {
  position: sticky;
  top: 0;
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
}

.feed-tabs::-webkit-scrollbar {
  display: none; /* Chrome/Safari/Edge */
}

/* Removed conflicting top adjustment */

.tab-btn {
  white-space: nowrap;
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 0.5rem 0.25rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  position: relative;
  transition: color 0.3s;
}

.tab-btn:hover {
  color: var(--accent);
}

.tab-btn.active {
  color: var(--accent);
}

.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: -0.6rem;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--accent);
  border-radius: 3px 3px 0 0;
}

/* Create Post Section */
.create-post-section {
  margin-bottom: 2rem;
}

.create-card {
  display: flex;
  gap: 1rem;
  background: var(--card-bg);
  padding: 1.25rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.05);
  border: 1px solid var(--border);
  transition: all 0.3s ease;
  align-items: flex-start;
}

.create-card:not(.expanded) {
  align-items: center;
}


.create-card.expanded {
  flex-direction: column;
}

.composer-top {
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: width 0.3s ease;
  width: 100%;
}

.create-card:not(.expanded) .composer-top {
  width: auto;
}

.create-card.expanded {
  flex-direction: column;
  align-items: stretch;
}

.create-card.expanded .composer-top {
  margin-bottom: 0.5rem;
}

.title-input-top {
  flex: 1;
  border: none;
  font-size: 1.15rem;
  font-weight: 700;
  background: transparent;
  color: var(--text-h);
  outline: none;
}

.user-avatar {
  flex-shrink: 0;
}

.user-avatar img, .avatar-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  object-fit: cover;
}

.avatar-placeholder {
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.2rem;
}

.form-container {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
}

.title-input {
  border: none;
  font-size: 1.1rem;
  font-weight: 700;
  background: transparent;
  color: var(--text-h);
  outline: none;
}

.content-input {
  border: none;
  font-size: 1rem;
  resize: none;
  background: transparent;
  color: var(--text);
  outline: none;
  min-height: 40px;
  line-height: normal;
}

.create-card.expanded .content-input {
  min-height: 80px;
}


.image-preview-grid {
  margin-top: 0.5rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.55rem;
}

.preview-thumb-btn {
  position: relative;
  border: 0;
  border-radius: 12px;
  padding: 0;
  margin: 0;
  overflow: hidden;
  cursor: zoom-in;
  background: transparent;
}

.preview-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  display: block;
}

.preview-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border-radius: 999px;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
}

.preview-counter {
  grid-column: 1 / -1;
  font-size: 0.82rem;
  color: var(--text);
  font-weight: 600;
}

.composer-error {
  margin: 0;
  color: #d7263d;
  font-size: 0.84rem;
  font-weight: 600;
}

.form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.icon-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--accent);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  transition: background 0.2s;
}

.icon-btn:hover {
  background: var(--accent-bg);
}

.icon-btn.disabled {
  opacity: 0.55;
  pointer-events: none;
}

.submit-group {
  display: flex;
  gap: 0.75rem;
}

.cancel-btn {
  background: none;
  border: none;
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
}

.publish-btn {
  background: var(--accent);
  color: white;
  border: none;
  padding: 0.6rem 1.5rem;
  border-radius: 99px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s;
}

.publish-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.publish-btn:not(:disabled):hover {
  transform: translateY(-2px);
}

/* Post Card */
.post-card {
  background: var(--card-bg);
  border-radius: 20px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--border);
  box-shadow: 0 4px 25px rgba(0,0,0,0.03);
  transition: transform 0.2s, box-shadow 0.2s;
  animation: fadeIn 0.5s ease-out forwards;
}

.html-desc {
  font-family: inherit;
  line-height: 1.6;
}
.html-desc :deep(p) { margin-bottom: 1rem; }
.html-desc :deep(a) { color: var(--accent); text-decoration: underline; }
.html-desc :deep(img) {
  max-width: 100%;
  border-radius: 12px;
  margin: 1rem 0;
  cursor: zoom-in;
}

.post-header {
  padding: 0 0 1.25rem 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.post-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.post-user {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.post-user-btn {
  border: 0;
  background: transparent;
  padding: 0;
  margin: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.post-user-btn:hover .user-name {
  color: var(--accent);
}

.mini-avatar, .mini-avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
}

.mini-avatar-placeholder {
  background: var(--social-bg);
  color: var(--text-h);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.user-details {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-weight: 700;
  color: var(--text-h);
  font-size: 0.95rem;
}

.post-date {
  font-size: 0.8rem;
  color: var(--text);
}

.tag {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  text-transform: uppercase;
}

.tag.news {
  background: #fff0f0;
  color: #ff4d4d;
}

.post-content {
  padding: 0;
}

.post-content h3 {
  margin: 0 0 0.5rem;
  font-size: 1.2rem;
  color: var(--text-h);
}

.title-link-btn {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  padding: 0;
  margin: 0;
  text-align: left;
  cursor: pointer;
}

.title-link-btn:hover {
  color: var(--accent);
}

.post-content p {
  white-space: pre-wrap;
  color: var(--text);
  line-height: 1.6;
}

.post-images {
  margin-top: 1rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.6rem;
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

.post-footer {
  padding: 1.25rem 0 0 0;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 1.5rem;
}

.interaction-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 600;
  font-size: 0.85rem;
}

.interaction-btn:hover {
  background: var(--accent-bg);
  color: var(--accent);
  border-color: var(--accent);
}

.interaction-btn.active {
  background: var(--accent-bg);
  color: var(--accent);
  border-color: var(--accent);
}

.interaction-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.interaction-btn.share {
  margin-left: auto;
}

.detail-info-card {
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  margin-bottom: 1rem;
  color: var(--text);
  font-weight: 600;
}

.detail-info-card.error {
  border-color: #f2b4b4;
  color: #b91c1c;
}

.interaction-error {
  margin: 0.45rem 0 0;
  color: #b91c1c;
  font-size: 0.8rem;
  font-weight: 600;
}

/* Loading & Empty */
.loading-state {
  text-align: center;
  padding: 4rem 0;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--accent-bg);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.infinite-sentinel {
  margin-top: 0.8rem;
  width: 100%;
  padding: 1rem;
  text-align: center;
  border-radius: 14px;
  border: 1px dashed var(--border);
  color: var(--text);
  background: var(--card-bg);
  font-weight: 600;
}

@media (max-width: 640px) {
  .feed-container {
    padding: 1rem 0;
  }

  .create-post-section {
    padding: 0 0.75rem;
    margin-bottom: 1rem;
  }

  .feed-tabs {
    padding: 0 1rem;
    margin-bottom: 0.5rem;
    gap: 1.25rem;
  }

  .feed-tabs::after {
    flex: 0 0 1rem; /* Adjust spacer for mobile */
  }
  
  .feed-tabs::-webkit-scrollbar {
    display: none;
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

  .main-image {
    height: 180px;
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
    margin: 0 -1rem;
    width: auto;
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

  .interaction-btn {
    padding: 0.5rem 0.8rem;
    font-size: 0.8rem;
    gap: 0.35rem;
  }
}
</style>




