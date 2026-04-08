<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useFeedStore } from '@/stores/feedStore'
import { useAuthStore } from '@/stores/authStore'
import { useStorageStore } from '@/stores/storageStore'
import { useSurveyStore } from '@/stores/surveyStore'
import FeedAdItem from '@/components/feed/FeedAdItem.vue'
import ImageLightbox from '@/components/common/ImageLightbox.vue'
import SurveySection from '@/components/surveys/SurveySection.vue'

const feedStore = useFeedStore()
const authStore = useAuthStore()
const storageStore = useStorageStore()
const surveyStore = useSurveyStore()

// Form state
const newPostTitle = ref('')
const newPostContent = ref('')
const selectedFile = ref<File | null>(null)
const imagePreview = ref<string | null>(null)
const isExpanded = ref(false)
const lightboxOpen = ref(false)
const lightboxImages = ref<string[]>([])
const lightboxStartIndex = ref(0)
const infiniteSentinel = ref<HTMLElement | null>(null)
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

const revokePreviewUrl = () => {
  if (!imagePreview.value) return
  URL.revokeObjectURL(imagePreview.value)
}

const clearSelectedImage = () => {
  selectedFile.value = null
  revokePreviewUrl()
  imagePreview.value = null
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

onMounted(async () => {
  feedStore.initFeed()
  surveyStore.initFeaturedSurveyListener()
  await setupInfiniteObserver()
})

onUnmounted(() => {
  if (infiniteObserver) {
    infiniteObserver.disconnect()
    infiniteObserver = null
  }
  revokePreviewUrl()
  surveyStore.cleanupFeaturedSurvey()
  feedStore.cleanup()
})

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    revokePreviewUrl()
    selectedFile.value = target.files[0]
    imagePreview.value = URL.createObjectURL(target.files[0])
  }
}

const handleCreatePost = async () => {
  if (!newPostContent.value.trim()) return

  try {
    let imageUrls: string[] = []
    
    if (selectedFile.value) {
      const path = `posts/${authStore.user?.uid}/${Date.now()}_${selectedFile.value.name}`
      const url = await storageStore.uploadFile(selectedFile.value, path)
      imageUrls.push(url)
    }

    await feedStore.createPost(
      newPostTitle.value || 'Nueva Publicación',
      newPostContent.value,
      imageUrls
    )

    // Reset form
    newPostTitle.value = ''
    newPostContent.value = ''
    clearSelectedImage()
    isExpanded.value = false
  } catch (err) {
    console.error('Error al crear post:', err)
  }
}

const handleAdImpression = (item: any) => {
  feedStore.trackAdImpression(item)
}

const handleAdClick = (item: any) => {
  feedStore.trackAdClick(item)
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
</script>

<template>
  <div class="feed-container">
    <!-- Tabs Section -->
    <div class="feed-tabs">
      <button
        v-for="tab in visibleTabs"
        :key="tab.key"
        :class="['tab-btn', { active: feedStore.currentTab === tab.key }]"
        @click="feedStore.initFeed(tab.key)"
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
        feedStore.currentTab !== 'surveys'
      "
      class="create-post-section"
    >
      <div class="create-card" :class="{ expanded: isExpanded }">
        <div class="user-avatar">
          <img v-if="authStore.userProfile?.profilePictureUrl" :src="authStore.userProfile.profilePictureUrl" />
          <div v-else class="avatar-placeholder">{{ authStore.userProfile?.nombre?.charAt(0) }}</div>
        </div>
        
        <div class="form-container">
          <input 
            v-if="isExpanded"
            v-model="newPostTitle"
            type="text" 
            placeholder="Título (opcional)" 
            class="title-input"
          />
          <textarea 
            v-model="newPostContent"
            placeholder="¿Qué estás pensando?" 
            class="content-input"
            @focus="isExpanded = true"
            :rows="isExpanded ? 4 : 1"
          ></textarea>

          <div v-if="imagePreview" class="image-preview-container">
            <img :src="imagePreview" class="preview-img" @click="imagePreview && openLightbox([imagePreview], 0)" />
            <button @click="imagePreview = null; selectedFile = null" class="remove-preview">×</button>
          </div>

          <div v-if="isExpanded" class="form-footer">
            <div class="actions">
              <label class="icon-btn">
                <input type="file" @change="handleFileSelect" accept="image/*" hidden />
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                <span>Imagen</span>
              </label>
            </div>
            
            <div class="submit-group">
              <button @click="isExpanded = false" class="cancel-btn">Cancelar</button>
              <button 
                @click="handleCreatePost" 
                :disabled="!newPostContent.trim() || storageStore.uploading"
                class="publish-btn"
              >
                {{ storageStore.uploading ? `Subiendo ${Math.round(storageStore.uploadProgress)}%` : 'Publicar' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Feed List -->
    <SurveySection v-if="feedStore.currentTab === 'surveys'" />

    <div
      v-if="feedStore.currentTab !== 'surveys' && feedStore.loading && feedStore.allItems.length === 0"
      class="loading-state"
    >
      <div class="spinner"></div>
      <p>Sincronizando con CdeluAR...</p>
    </div>

    <div
      v-else-if="feedStore.currentTab !== 'surveys' && feedStore.allItems.length === 0"
      class="empty-state"
    >
      <div class="empty-icon">📭</div>
      <h3>No hay nada por aquí</h3>
      <p v-if="feedStore.currentTab !== 'news'">Sé el primero en compartir algo con la comunidad.</p>
      <p v-else>Aún no hay noticias oficiales.</p>
    </div>

    <div v-else-if="feedStore.currentTab !== 'surveys'" class="post-list">
      <div v-for="item in feedStore.allItems" :key="item.id">
        <FeedAdItem
          v-if="item.isAd"
          :item="item"
          @impression="handleAdImpression"
          @click-ad="handleAdClick"
        />

        <div v-else class="post-card">
        <header class="post-header">
          <div class="post-user">
            <img v-if="item.userProfilePicUrl" :src="item.userProfilePicUrl" class="mini-avatar" />
            <div v-else class="mini-avatar-placeholder">{{ item.userName?.charAt(0) || 'U' }}</div>
            <div class="user-details">
              <span class="user-name">{{ item.userName || 'Usuario' }}</span>
              <span class="post-date">{{ formatDate(item.createdAt) }}</span>
            </div>
          </div>
          <div v-if="item.type === 'news'" class="tag news">Noticia</div>
        </header>

        <div class="post-content">
          <h3 v-if="item.titulo && item.titulo !== 'Nueva Publicación'">{{ item.titulo }}</h3>
          <div
            v-if="item.isOficial"
            class="html-desc"
            v-html="item.descripcion"
            @click="handleHtmlImageClick"
          ></div>
          <p v-else>{{ item.descripcion }}</p>
          
          <div v-if="item.images && item.images.length > 0" class="post-images">
            <button
              v-for="(image, imageIndex) in item.images"
              :key="`${item.id}_${imageIndex}`"
              class="post-image-btn"
              type="button"
              @click="openLightbox(item.images, Number(imageIndex))"
            >
              <img :src="image" class="main-image" loading="lazy" />
            </button>
          </div>
        </div>

        <footer class="post-footer">
          <button class="interaction-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            <span>{{ item.stats?.likesCount || 0 }}</span>
          </button>
          <button class="interaction-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-10.6 8.38 8.38 0 0 1 3.8.9L21 3z"></path></svg>
            <span>{{ item.stats?.commentsCount || 0 }}</span>
          </button>
          <button class="interaction-btn share">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </button>
        </footer>
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
  </div>
</template>

<style scoped>
.feed-container {
  max-width: 680px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

/* Feed Tabs */
.feed-tabs {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
}

.tab-btn {
  background: none;
  border: none;
  padding: 0.5rem 1rem;
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
}

.create-card.expanded {
  flex-direction: column;
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
  min-height: 80px;
}

.image-preview-container {
  position: relative;
  margin-top: 0.5rem;
  border-radius: 12px;
  overflow: hidden;
  max-height: 300px;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: zoom-in;
}

.remove-preview {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0,0,0,0.6);
  color: white;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
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

.post-user {
  display: flex;
  gap: 0.75rem;
  align-items: center;
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
  height: 220px;
  object-fit: cover;
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

.interaction-btn.share {
  margin-left: auto;
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
</style>
