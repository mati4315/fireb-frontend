<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe
} from 'firebase/firestore'
import { db } from '@/config/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useModuleStore } from '@/stores/moduleStore'
import { isAdminUser } from '@/utils/roles'

const facebookPageUrl = 'https://www.facebook.com/anormalia22/'
const moduleStore = useModuleStore()
const authStore = useAuthStore()
const route = useRoute()
const episodes = ref<AnormaliaEpisode[]>([])
const hasStoredEpisodes = ref(false)
const savingEpisode = ref(false)
const removingEpisodeId = ref('')
const editingEpisodeId = ref('')
const manageError = ref('')
const manageSuccess = ref('')
const newEpisodeTitle = ref('')
const newEpisodeSeason = ref('Temporada 2')
const newEpisodeUrl = ref('')
const newEpisodeCover = ref('')
let episodesUnsubscribe: Unsubscribe | null = null
let seedInProgress = false

type AnormaliaEpisode = {
  id: string
  title: string
  season: string
  videoUrl: string
  coverUrl: string
  published: boolean
  isDefault?: boolean
}

const defaultEpisode: AnormaliaEpisode = {
  id: 'programa-2',
  title: 'Programa N.º 2',
  season: 'Temporada 2',
  videoUrl: 'https://www.facebook.com/share/v/1DLWqekGJN/',
  coverUrl: '/images/anormalia-22-programa-2.jpg',
  published: true,
  isDefault: true
}

const isAdmin = computed(() => isAdminUser(
  authStore.userProfile?.rol,
  authStore.user?.email || authStore.userProfile?.email,
  authStore.user?.uid,
  authStore.tokenClaims
))
const visibleEpisodes = computed(() =>
  hasStoredEpisodes.value ? episodes.value : [defaultEpisode]
)
const tabPaths: Record<string, string> = {
  todo: '/todo',
  news: '/noticia',
  post: '/c',
  surveys: '/encuestas',
  lottery: '/loteria',
  secrets: '/secretos'
}
const navigationTabs = computed(() =>
  moduleStore.availableTabs
    .filter((tab) => Boolean(tabPaths[tab.key]))
    .map((tab) => ({ ...tab, path: tabPaths[tab.key] }))
)

const ensureDefaultEpisode = async () => {
  if (!isAdmin.value || seedInProgress) return
  seedInProgress = true
  try {
    const episodeRef = doc(db, 'anormalia22_episodes', defaultEpisode.id)
    const existingEpisode = await getDoc(episodeRef)
    if (existingEpisode.exists()) return

    await setDoc(episodeRef, {
      title: defaultEpisode.title,
      season: defaultEpisode.season,
      videoUrl: defaultEpisode.videoUrl,
      coverUrl: defaultEpisode.coverUrl,
      published: true,
      createdBy: authStore.user?.uid || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  } catch (error: any) {
    manageError.value = error?.message || 'No se pudo inicializar el catalogo de programas.'
  } finally {
    seedInProgress = false
  }
}

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

const resetEpisodeForm = () => {
  editingEpisodeId.value = ''
  newEpisodeTitle.value = ''
  newEpisodeSeason.value = 'Temporada 2'
  newEpisodeUrl.value = ''
  newEpisodeCover.value = ''
}

const editEpisode = (episode: AnormaliaEpisode) => {
  manageError.value = ''
  manageSuccess.value = ''
  editingEpisodeId.value = episode.id
  newEpisodeTitle.value = episode.title
  newEpisodeSeason.value = episode.season || 'Temporada 2'
  newEpisodeUrl.value = episode.videoUrl
  newEpisodeCover.value = episode.coverUrl === defaultEpisode.coverUrl ? '' : episode.coverUrl
  document.querySelector('.admin-episode-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const cancelEpisodeEdit = () => {
  resetEpisodeForm()
  manageError.value = ''
  manageSuccess.value = ''
}

const saveEpisode = async () => {
  manageError.value = ''
  manageSuccess.value = ''
  const title = newEpisodeTitle.value.trim()
  const season = newEpisodeSeason.value.trim()
  const videoUrl = newEpisodeUrl.value.trim()
  const coverUrl = newEpisodeCover.value.trim() || defaultEpisode.coverUrl

  if (!title || !season) {
    manageError.value = 'Completa el titulo del programa y la temporada.'
    return
  }
  if (!isHttpsUrl(videoUrl)) {
    manageError.value = 'El enlace del programa debe ser una URL HTTPS valida.'
    return
  }
  if (!coverUrl.startsWith('/') && !isHttpsUrl(coverUrl)) {
    manageError.value = 'La portada debe ser una URL HTTPS valida.'
    return
  }

  savingEpisode.value = true
  try {
    const episodeData = {
      title,
      season,
      videoUrl,
      coverUrl,
      published: true,
      updatedAt: serverTimestamp(),
      updatedBy: authStore.user?.uid || ''
    }

    if (editingEpisodeId.value) {
      await updateDoc(doc(db, 'anormalia22_episodes', editingEpisodeId.value), episodeData)
      manageSuccess.value = 'Los cambios del programa se guardaron.'
    } else {
      await addDoc(collection(db, 'anormalia22_episodes'), {
        ...episodeData,
        announceOnHome: true,
        createdBy: authStore.user?.uid || '',
        createdAt: serverTimestamp()
      })
      manageSuccess.value = 'El programa se agrego al catalogo.'
    }
    resetEpisodeForm()
  } catch (error: any) {
    manageError.value = error?.message || (editingEpisodeId.value
      ? 'No se pudieron guardar los cambios del programa.'
      : 'No se pudo agregar el programa.')
  } finally {
    savingEpisode.value = false
  }
}

const removeEpisode = async (episode: AnormaliaEpisode) => {
  if (episode.isDefault || removingEpisodeId.value) return
  if (!window.confirm(`¿Quieres quitar «${episode.title}» del catalogo?`)) return

  manageError.value = ''
  manageSuccess.value = ''
  removingEpisodeId.value = episode.id
  try {
    await updateDoc(doc(db, 'anormalia22_episodes', episode.id), {
      published: false,
      updatedAt: serverTimestamp(),
      updatedBy: authStore.user?.uid || ''
    })
    manageSuccess.value = 'El programa se quito del catalogo.'
  } catch (error: any) {
    manageError.value = error?.message || 'No se pudo quitar el programa.'
  } finally {
    removingEpisodeId.value = ''
  }
}

watch(isAdmin, (value) => {
  if (value) void ensureDefaultEpisode()
}, { immediate: true })

onMounted(() => {
  const episodesQuery = query(
    collection(db, 'anormalia22_episodes'),
    orderBy('createdAt', 'desc')
  )
  episodesUnsubscribe = onSnapshot(episodesQuery, (snapshot) => {
    hasStoredEpisodes.value = !snapshot.empty
    episodes.value = snapshot.docs
      .map((episodeDoc) => {
        const data = episodeDoc.data()
        return {
          id: episodeDoc.id,
          title: typeof data.title === 'string' ? data.title : 'Programa',
          season: typeof data.season === 'string' ? data.season : '',
          videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl : '',
          coverUrl: typeof data.coverUrl === 'string' ? data.coverUrl : defaultEpisode.coverUrl,
          published: data.published !== false
        }
      })
      .filter((episode) => episode.published && episode.videoUrl)
  }, (error) => {
    manageError.value = error.message || 'No se pudieron cargar los programas.'
  })
})

onBeforeUnmount(() => {
  episodesUnsubscribe?.()
})
</script>

<template>
  <main class="anormalia-page">
    <nav class="feed-tabs tabs-at-top" aria-label="Secciones principales">
      <RouterLink
        v-for="tab in navigationTabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: route.path === tab.path }"
        :to="tab.path"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>

    <header class="show-hero">
      <div class="hero-copy">
        <p class="eyebrow"><span class="live-dot"></span> PROGRAMAS · PODCASTS · IDEAS</p>
        <h1>Anormalia <span>22</span></h1>
        <p class="hero-description">Un espacio para todos esos programas que merecen ser escuchados.</p>
        <a class="hero-link" href="#episodios">Explorar episodios <span aria-hidden="true">↓</span></a>
      </div>
      <div class="hero-social">
        <div class="facebook-copy">
          <span class="facebook-mark" aria-hidden="true">f</span>
          <div>
            <h2>Seguinos en Facebook</h2>
            <p>Sumate a la comunidad de Anormalia 22.</p>
          </div>
        </div>
        <a class="facebook-fallback" :href="facebookPageUrl" target="_blank" rel="noopener noreferrer">
          Seguir página en Facebook <span aria-hidden="true">↗</span>
        </a>
      </div>
      <span class="hero-orbit orbit-one" aria-hidden="true"></span>
      <span class="hero-orbit orbit-two" aria-hidden="true"></span>
      <span class="hero-index" aria-hidden="true">CDELU / ORIGINALS</span>
    </header>

    <section id="episodios" class="episodes" aria-labelledby="episodes-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">EL ARCHIVO</p>
          <h2 id="episodes-title">Programas</h2>
        </div>
        <span class="episode-count">{{ String(visibleEpisodes.length).padStart(2, '0') }} PROGRAMAS</span>
      </div>

      <form v-if="isAdmin" class="admin-episode-form" @submit.prevent="saveEpisode">
        <div class="admin-form-heading">
          <div>
            <p class="section-kicker">ADMINISTRACIÓN</p>
            <h3>{{ editingEpisodeId ? 'Editar programa' : 'Agregar un programa' }}</h3>
          </div>
          <span class="admin-badge">ADMIN</span>
        </div>
        <div class="admin-form-grid">
          <label>
            Título del capítulo
            <input v-model="newEpisodeTitle" maxlength="120" required placeholder="Ej.: Programa N.º 3">
          </label>
          <label>
            Temporada
            <input v-model="newEpisodeSeason" maxlength="60" required placeholder="Temporada 2">
          </label>
          <label class="form-wide">
            Enlace HTTPS del video
            <input v-model="newEpisodeUrl" type="url" required placeholder="https://www.facebook.com/...">
          </label>
          <label class="form-wide">
            URL HTTPS de portada (opcional)
            <input v-model="newEpisodeCover" type="text" inputmode="url" placeholder="Vacío para usar la portada actual">
          </label>
        </div>
        <div class="admin-form-actions">
          <p v-if="manageError" class="form-message error">{{ manageError }}</p>
          <p v-else-if="manageSuccess" class="form-message success">{{ manageSuccess }}</p>
          <div class="admin-form-buttons">
            <button v-if="editingEpisodeId" class="cancel-edit-btn" type="button" :disabled="savingEpisode" @click="cancelEpisodeEdit">
              Cancelar
            </button>
            <button class="add-episode-btn" type="submit" :disabled="savingEpisode">
              {{ savingEpisode ? 'Guardando...' : editingEpisodeId ? 'Guardar cambios' : 'Agregar programa' }}
            </button>
          </div>
        </div>
      </form>

      <p v-if="!visibleEpisodes.length" class="empty-episodes">Todavía no hay programas publicados.</p>

      <div class="episode-list">
        <article v-for="episode in visibleEpisodes" :key="episode.id" class="episode-item">
          <a
            class="episode-card"
            :href="episode.videoUrl"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Ver ${episode.title} de Anormalia 22`"
          >
            <span class="cover-wrap">
              <img
                class="episode-cover"
                :src="episode.coverUrl"
                :alt="`Portada de Anormalia 22, ${episode.season}`"
                loading="lazy"
              >
              <span class="cover-shade" aria-hidden="true"></span>
              <span class="season-tag">{{ episode.season }}</span>
              <span class="diagonal-title">
                <span>ANORMALIA 22</span>
                <strong>{{ episode.title }}</strong>
              </span>
              <span class="cover-play" aria-hidden="true">▶</span>
            </span>
            <span class="episode-footer">
              <span class="episode-meta"><b>{{ episode.title }}</b><small>{{ episode.season }}</small></span>
              <span class="episode-action">Ver programa <span aria-hidden="true">↗</span></span>
            </span>
          </a>
          <div v-if="isAdmin" class="episode-admin-actions">
            <button
              class="edit-episode-btn"
              type="button"
              :disabled="savingEpisode || removingEpisodeId === episode.id"
              @click="editEpisode(episode)"
            >
              Editar
            </button>
            <button
              class="remove-episode-btn"
              type="button"
              :disabled="removingEpisodeId === episode.id || savingEpisode"
              @click="removeEpisode(episode)"
            >
              {{ removingEpisodeId === episode.id ? 'Quitando...' : 'Quitar' }}
            </button>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.anormalia-page {
  --anormalia-lime: #d4f36b;
  --anormalia-orange: #ff7654;
  width: min(1080px, 100%);
  margin: 0 auto;
  padding: clamp(1rem, 4vw, 2.5rem) clamp(0.75rem, 3vw, 1.5rem) 4rem;
  color: var(--text-h);
}

.feed-tabs {
  display: flex;
  gap: 1.5rem;
  align-items: center;
  height: var(--header-height);
  margin-bottom: 1.25rem;
  padding: 0 1.25rem;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  background: var(--glass);
  backdrop-filter: blur(12px);
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.feed-tabs::-webkit-scrollbar {
  display: none;
}

.tab-btn {
  position: relative;
  flex: 0 0 auto;
  padding: 0.5rem 0.25rem;
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 650;
  text-decoration: none;
  white-space: nowrap;
  transition: color 180ms ease;
}

.tab-btn:hover,
.tab-btn.active {
  color: var(--accent);
}

.tab-btn.active::after {
  position: absolute;
  right: 0;
  bottom: -0.65rem;
  left: 0;
  height: 2px;
  background: var(--accent);
  content: '';
}

.show-hero {
  min-height: 340px;
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  align-items: center;
  gap: clamp(1.5rem, 4vw, 3rem);
  overflow: hidden;
  padding: clamp(2rem, 6vw, 4rem);
  border-radius: 26px;
  color: #f6f7ef;
  background:
    radial-gradient(ellipse at 82% 4%, rgba(212, 243, 107, 0.2), transparent 34%),
    radial-gradient(ellipse at 92% 100%, rgba(255, 118, 84, 0.17), transparent 36%),
    linear-gradient(125deg, #111619 0%, #202a2a 58%, #293229 100%);
  box-shadow: 0 22px 55px rgba(15, 24, 20, 0.18);
}

.hero-copy {
  max-width: 640px;
  position: relative;
  z-index: 1;
}

.hero-social {
  position: relative;
  z-index: 1;
  width: 100%;
  padding: 1.1rem 1rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.17);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
}

.facebook-copy {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  margin-bottom: 0.35rem;
}

.facebook-mark {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: grid;
  place-items: end center;
  overflow: hidden;
  border-radius: 50%;
  background: #1877f2;
  color: #fff;
  font-family: Arial, sans-serif;
  font-size: 1.95rem;
  font-weight: 800;
  line-height: 1;
}

.facebook-copy h2 {
  margin: 0;
  color: #fff;
  font-size: 0.92rem;
}

.facebook-copy p {
  margin: 0.2rem 0 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.74rem;
}

.facebook-fallback {
  display: block;
  width: fit-content;
  margin: 0.85rem auto 0;
  padding: 0.65rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: #1877f2;
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
  transition: background 160ms ease, transform 160ms ease;
}

.facebook-fallback:hover {
  background: #0e67d5;
  transform: translateY(-1px);
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0 0 1.1rem;
  color: #dce4d5;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--anormalia-lime);
  box-shadow: 0 0 14px rgba(212, 243, 107, 0.8);
}

.show-hero h1 {
  margin: 0;
  color: #f6f7ef;
  font-size: clamp(3.2rem, 9vw, 6.4rem);
  font-weight: 900;
  letter-spacing: -0.085em;
  line-height: 0.9;
}

.show-hero h1 span {
  color: var(--anormalia-lime);
}

.hero-description {
  max-width: 390px;
  margin: 1.1rem 0 1.25rem;
  color: rgba(246, 247, 239, 0.76);
  font-size: 0.98rem;
  line-height: 1.6;
}

.hero-link {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--anormalia-lime);
  font-size: 0.86rem;
  font-weight: 800;
  text-decoration: none;
}

.hero-link:hover {
  color: #fff;
}

.hero-orbit {
  position: absolute;
  z-index: -1;
  border: 1px solid rgba(246, 247, 239, 0.1);
  border-radius: 50%;
}

.orbit-one {
  width: 430px;
  height: 430px;
  top: -260px;
  right: 15%;
}

.orbit-two {
  width: 300px;
  height: 300px;
  right: -90px;
  bottom: -235px;
  border-color: rgba(212, 243, 107, 0.2);
}

.hero-index {
  position: absolute;
  right: 1.4rem;
  bottom: 1.1rem;
  color: rgba(246, 247, 239, 0.45);
  font-size: 0.56rem;
  font-weight: 800;
  letter-spacing: 0.15em;
}

.episodes {
  padding-top: clamp(2rem, 5vw, 3.5rem);
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.section-kicker {
  margin: 0 0 0.3rem;
  color: var(--anormalia-orange);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.15em;
}

.section-heading h2 {
  margin: 0;
  color: var(--text-h);
  font-size: clamp(1.55rem, 4vw, 2.2rem);
  font-weight: 850;
  letter-spacing: -0.05em;
}

.episode-count {
  padding-bottom: 0.25rem;
  color: var(--text);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.episode-card {
  width: 100%;
  display: block;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--card-bg);
  text-decoration: none;
  box-shadow: 0 16px 42px rgba(20, 30, 50, 0.12);
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.episode-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 22px 48px rgba(20, 30, 50, 0.18);
}

.cover-wrap {
  position: relative;
  isolation: isolate;
  width: 100%;
  display: block;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  border-radius: 19px 19px 0 0;
  background: #14204c;
}

.episode-cover,
.cover-shade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.episode-cover {
  object-fit: cover;
  object-position: center;
  transition: transform 400ms ease;
}

.cover-shade {
  background: linear-gradient(180deg, rgba(5, 8, 20, 0.04), rgba(5, 8, 20, 0.02) 42%, rgba(5, 8, 20, 0.5));
}

.episode-card:hover .episode-cover {
  transform: scale(1.035);
}

.season-tag {
  position: absolute;
  top: 1rem;
  left: 1rem;
  padding: 0.45rem 0.65rem;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 999px;
  background: rgba(12, 18, 38, 0.4);
  color: #fff;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  backdrop-filter: blur(8px);
}

.diagonal-title {
  position: absolute;
  left: 50%;
  top: 51%;
  width: min(112%, 760px);
  display: grid;
  justify-items: center;
  gap: 0.25rem;
  padding: 0.85rem 1rem 1rem;
  transform: translate(-50%, -50%) rotate(-6deg);
  border-top: 2px solid rgba(255, 255, 255, 0.9);
  border-bottom: 2px solid rgba(255, 255, 255, 0.9);
  background: rgba(15, 23, 47, 0.79);
  color: #fff;
  text-align: center;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(5px);
  transition: transform 250ms ease, background 250ms ease;
}

.diagonal-title > span {
  color: #ffe17c;
  font-size: clamp(0.55rem, 1.4vw, 0.7rem);
  font-weight: 800;
  letter-spacing: 0.2em;
}

.diagonal-title strong {
  font-size: clamp(1.35rem, 4.5vw, 2.8rem);
  font-weight: 900;
  letter-spacing: -0.05em;
  line-height: 1.05;
}

.episode-card:hover .diagonal-title {
  transform: translate(-50%, -50%) rotate(-3deg) scale(1.02);
  background: rgba(15, 23, 47, 0.88);
}

.cover-play {
  position: absolute;
  right: 1rem;
  bottom: 1rem;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  padding-left: 2px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 50%;
  background: rgba(15, 23, 47, 0.5);
  color: #fff;
  font-size: 0.8rem;
  backdrop-filter: blur(8px);
}

.episode-footer {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.2rem;
  color: var(--text-h);
}

.episode-meta {
  display: grid;
  gap: 0.2rem;
}

.episode-meta b {
  font-size: 0.66rem;
  letter-spacing: 0.12em;
}

.episode-meta small {
  color: var(--text);
  font-size: 0.78rem;
}

.episode-action {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #d45b3e;
  font-size: 0.82rem;
  font-weight: 700;
}

.episode-action span {
  font-size: 1rem;
  transition: transform 180ms ease;
}

.episode-card:hover .episode-action span {
  transform: translate(2px, -2px);
}

.episode-card:focus-visible {
  outline: 3px solid #d45b3e;
  outline-offset: 4px;
}

.episode-list {
  width: min(100%, 980px);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
  gap: 1.25rem;
  margin: 0 auto;
}

.episode-item {
  position: relative;
  min-width: 0;
}

.episode-admin-actions {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 3;
  display: flex;
  gap: 0.4rem;
}

.episode-admin-actions button {
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(20, 25, 35, 0.78);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
}

.edit-episode-btn:hover:not(:disabled) {
  border-color: var(--anormalia-lime);
  background: rgba(42, 55, 40, 0.95);
}

.remove-episode-btn:hover:not(:disabled) {
  border-color: #ff7654;
  background: #9e372c;
}

.episode-admin-actions button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.empty-episodes {
  width: min(100%, 820px);
  margin: 0 auto;
  padding: 2rem;
  border: 1px dashed var(--border);
  border-radius: 16px;
  color: var(--text);
  text-align: center;
}

.admin-episode-form {
  width: min(100%, 980px);
  margin: 0 auto 1.25rem;
  padding: 1.25rem;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--card-bg);
}

.admin-form-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.admin-form-heading h3 {
  margin: 0;
  color: var(--text-h);
  font-size: 1rem;
}

.admin-badge {
  padding: 0.35rem 0.55rem;
  border-radius: 999px;
  background: rgba(212, 243, 107, 0.2);
  color: #526a0c;
  font-size: 0.62rem;
  font-weight: 850;
  letter-spacing: 0.1em;
}

.admin-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.admin-form-grid label {
  display: grid;
  gap: 0.35rem;
  color: var(--text-h);
  font-size: 0.78rem;
  font-weight: 700;
}

.admin-form-grid .form-wide {
  grid-column: 1 / -1;
}

.admin-form-grid input {
  width: 100%;
  min-width: 0;
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg);
  color: var(--text-h);
  font: inherit;
  font-weight: 400;
}

.admin-form-grid input:focus {
  border-color: var(--accent);
  outline: 2px solid color-mix(in srgb, var(--accent) 25%, transparent);
}

.admin-form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
}

.admin-form-buttons {
  display: flex;
  flex: 0 0 auto;
  gap: 0.55rem;
}

.cancel-edit-btn {
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg);
  color: var(--text-h);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.cancel-edit-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.form-message {
  margin: 0;
  font-size: 0.78rem;
}

.form-message.error {
  color: #c83f32;
}

.form-message.success {
  color: #18804a;
}

.add-episode-btn {
  padding: 0.65rem 0.9rem;
  border: 0;
  border-radius: 9px;
  background: #202a2a;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 750;
  cursor: pointer;
}

.add-episode-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

@media (max-width: 560px) {
  .show-hero {
    min-height: 0;
    grid-template-columns: 1fr;
    gap: 1.25rem;
    padding: 1.8rem 1rem 2.8rem;
    border-radius: 20px;
    text-align: center;
  }

  .hero-copy {
    margin: 0 auto;
  }

  .eyebrow {
    justify-content: center;
    font-size: 0.58rem;
  }

  .show-hero h1 {
    font-size: clamp(2.45rem, 10.5vw, 3.4rem);
    letter-spacing: -0.07em;
  }

  .hero-description {
    max-width: 290px;
    margin: 0.75rem auto 0.9rem;
    font-size: 0.9rem;
  }

  .hero-link {
    justify-content: center;
  }

  .hero-social {
    width: min(100%, 420px);
    justify-self: center;
    padding: 0.9rem 0.65rem 0.55rem;
    text-align: center;
  }

  .facebook-copy {
    justify-content: center;
    text-align: left;
  }

  .facebook-copy h2 {
    font-size: 0.85rem;
  }

  .facebook-copy p {
    font-size: 0.68rem;
  }

  .hero-index {
    right: auto;
    left: 50%;
    bottom: 0.85rem;
    transform: translateX(-50%);
  }

  .cover-wrap {
    aspect-ratio: 1 / 1;
    border-radius: 13px 13px 0 0;
  }

  .diagonal-title {
    width: 118%;
    padding: 0.65rem 0.5rem 0.75rem;
  }

  .season-tag {
    top: 0.7rem;
    left: 0.7rem;
    font-size: 0.5rem;
  }

  .episode-footer {
    min-height: 64px;
    padding: 0.7rem 0.85rem;
  }

  .episode-action {
    font-size: 0.72rem;
  }

  .admin-episode-form {
    padding: 1rem;
  }

  .admin-form-grid {
    grid-template-columns: 1fr;
  }

  .admin-form-grid .form-wide {
    grid-column: auto;
  }

  .admin-form-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .admin-form-buttons {
    flex-direction: column-reverse;
  }

  .add-episode-btn {
    min-height: 44px;
  }

  .cancel-edit-btn {
    min-height: 42px;
  }

  .episode-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.45rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .episode-card,
  .episode-cover,
  .diagonal-title,
  .episode-action span {
    transition: none;
  }
}
</style>
