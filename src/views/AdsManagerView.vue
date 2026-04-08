<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore'
import { db } from '@/config/firebase'
import { useAuthStore } from '@/stores/authStore'
import { isStaffUser } from '@/utils/roles'

type FeedTab = 'todo' | 'news' | 'post'

type AdsForm = {
  title: string
  description: string
  imageUrl: string
  destinationUrl: string
  ctaLabel: string
  priority: number
  active: boolean
  startAt: string
  endAt: string
}

type AdsModuleForm = {
  enabled: boolean
  maxAdsPerFeed: number
  minPostsBetweenAds: number
  probability: number
  fetchLimit: number
  trackImpressions: boolean
  trackClicks: boolean
  tabs: FeedTab[]
  impressionCooldownMs: number
  clickCooldownMs: number
}

const authStore = useAuthStore()

const ads = ref<any[]>([])
const loadingAds = ref(false)
const savingAd = ref(false)
const savingConfig = ref(false)
const deletingAdId = ref<string | null>(null)
const editingAdId = ref<string | null>(null)
const feedback = ref('')
const errorMessage = ref('')

let unsubscribeAds: (() => void) | null = null
let unsubscribeConfig: (() => void) | null = null

const adForm = reactive<AdsForm>({
  title: '',
  description: '',
  imageUrl: '',
  destinationUrl: '',
  ctaLabel: 'Ver mas',
  priority: 5,
  active: true,
  startAt: '',
  endAt: ''
})

const moduleForm = reactive<AdsModuleForm>({
  enabled: true,
  maxAdsPerFeed: 2,
  minPostsBetweenAds: 6,
  probability: 0.7,
  fetchLimit: 8,
  trackImpressions: true,
  trackClicks: true,
  tabs: ['todo'],
  impressionCooldownMs: 3600000,
  clickCooldownMs: 0
})

const isAuthorized = computed(() => {
  const rol = authStore.userProfile?.rol
  const email = authStore.user?.email || authStore.userProfile?.email
  const uid = authStore.user?.uid
  return authStore.isAuthenticated && isStaffUser(rol, email, uid, authStore.tokenClaims)
})

const formTitle = computed(() =>
  editingAdId.value ? 'Editar publicidad' : 'Nueva publicidad'
)

const resetFeedback = () => {
  feedback.value = ''
  errorMessage.value = ''
}

const toIsoLocal = (value: any): string => {
  if (!value) return ''
  const date = value?.toDate ? value.toDate() : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const min = pad(date.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

const resetAdForm = () => {
  editingAdId.value = null
  adForm.title = ''
  adForm.description = ''
  adForm.imageUrl = ''
  adForm.destinationUrl = ''
  adForm.ctaLabel = 'Ver mas'
  adForm.priority = 5
  adForm.active = true
  adForm.startAt = ''
  adForm.endAt = ''
}

const setFormFromAd = (adItem: any) => {
  editingAdId.value = adItem.id
  adForm.title = adItem.title || ''
  adForm.description = adItem.description || ''
  adForm.imageUrl = adItem.imageUrl || ''
  adForm.destinationUrl = adItem.destinationUrl || ''
  adForm.ctaLabel = adItem.ctaLabel || 'Ver mas'
  adForm.priority = Number(adItem.priority || 5)
  adForm.active = Boolean(adItem.active)
  adForm.startAt = toIsoLocal(adItem.startAt)
  adForm.endAt = toIsoLocal(adItem.endAt)
}

const parseDateOrNull = (value: string) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : Timestamp.fromDate(parsed)
}

const ensureUrl = (value: string): string => {
  const normalized = value.trim()
  if (!normalized) return ''
  if (/^https?:\/\//i.test(normalized)) return normalized
  return `https://${normalized}`
}

const loadAds = () => {
  if (unsubscribeAds) unsubscribeAds()
  loadingAds.value = true

  const adsQuery = query(collection(db, 'ads'), orderBy('updatedAt', 'desc'), limit(200))

  unsubscribeAds = onSnapshot(
    adsQuery,
    (snapshot) => {
      ads.value = snapshot.docs.map((adDoc) => ({
        id: adDoc.id,
        ...adDoc.data()
      }))
      loadingAds.value = false
    },
    (error) => {
      loadingAds.value = false
      errorMessage.value = `No se pudo cargar ADS: ${error.message}`
    }
  )
}

const loadModuleConfig = () => {
  if (unsubscribeConfig) unsubscribeConfig()
  const configRef = doc(db, '_config', 'modules')

  unsubscribeConfig = onSnapshot(
    configRef,
    (snapshot) => {
      const adsConfig = snapshot.data()?.ads
      if (!adsConfig) return

      moduleForm.enabled = adsConfig.enabled ?? moduleForm.enabled
      moduleForm.maxAdsPerFeed = Number(adsConfig.maxAdsPerFeed ?? moduleForm.maxAdsPerFeed)
      moduleForm.minPostsBetweenAds = Number(
        adsConfig.minPostsBetweenAds ?? moduleForm.minPostsBetweenAds
      )
      moduleForm.probability = Number(adsConfig.probability ?? moduleForm.probability)
      moduleForm.fetchLimit = Number(adsConfig.fetchLimit ?? moduleForm.fetchLimit)
      moduleForm.trackImpressions = adsConfig.trackImpressions ?? moduleForm.trackImpressions
      moduleForm.trackClicks = adsConfig.trackClicks ?? moduleForm.trackClicks
      moduleForm.tabs = Array.isArray(adsConfig.tabs) ? adsConfig.tabs : moduleForm.tabs
      moduleForm.impressionCooldownMs = Number(
        adsConfig.impressionCooldownMs ?? moduleForm.impressionCooldownMs
      )
      moduleForm.clickCooldownMs = Number(
        adsConfig.clickCooldownMs ?? moduleForm.clickCooldownMs
      )
    },
    (error) => {
      errorMessage.value = `No se pudo cargar configuracion ADS: ${error.message}`
    }
  )
}

const saveModuleConfig = async () => {
  resetFeedback()
  savingConfig.value = true

  try {
    const tabs = moduleForm.tabs.length > 0 ? moduleForm.tabs : ['todo']
    await setDoc(
      doc(db, '_config', 'modules'),
      {
        ads: {
          enabled: Boolean(moduleForm.enabled),
          maxAdsPerFeed: Math.max(0, Math.min(6, Number(moduleForm.maxAdsPerFeed || 0))),
          minPostsBetweenAds: Math.max(
            1,
            Math.min(20, Number(moduleForm.minPostsBetweenAds || 1))
          ),
          probability: Math.max(0, Math.min(1, Number(moduleForm.probability || 0))),
          fetchLimit: Math.max(1, Math.min(20, Number(moduleForm.fetchLimit || 1))),
          trackImpressions: Boolean(moduleForm.trackImpressions),
          trackClicks: Boolean(moduleForm.trackClicks),
          tabs,
          impressionCooldownMs: Math.max(
            0,
            Number(moduleForm.impressionCooldownMs || 0)
          ),
          clickCooldownMs: Math.max(0, Number(moduleForm.clickCooldownMs || 0))
        }
      },
      { merge: true }
    )
    feedback.value = 'Configuracion ADS actualizada.'
  } catch (error: any) {
    errorMessage.value = `Error al guardar configuracion: ${error.message}`
  } finally {
    savingConfig.value = false
  }
}

const saveAd = async () => {
  resetFeedback()
  if (!adForm.title.trim()) {
    errorMessage.value = 'El titulo es obligatorio.'
    return
  }

  savingAd.value = true
  try {
    const payload = {
      module: 'ads',
      title: adForm.title.trim(),
      description: adForm.description.trim(),
      imageUrl: adForm.imageUrl.trim(),
      destinationUrl: ensureUrl(adForm.destinationUrl),
      ctaLabel: adForm.ctaLabel.trim() || 'Ver mas',
      priority: Math.max(1, Math.min(10, Number(adForm.priority || 1))),
      active: Boolean(adForm.active),
      startAt: parseDateOrNull(adForm.startAt),
      endAt: parseDateOrNull(adForm.endAt),
      updatedAt: serverTimestamp()
    }

    if (editingAdId.value) {
      await setDoc(doc(db, 'ads', editingAdId.value), payload, { merge: true })
      feedback.value = 'Publicidad actualizada.'
    } else {
      await addDoc(collection(db, 'ads'), {
        ...payload,
        stats: {
          impressionsTotal: 0,
          clicksTotal: 0,
          ctr: 0
        },
        createdAt: serverTimestamp()
      })
      feedback.value = 'Publicidad creada.'
    }

    resetAdForm()
  } catch (error: any) {
    errorMessage.value = `Error al guardar publicidad: ${error.message}`
  } finally {
    savingAd.value = false
  }
}

const toggleAd = async (adItem: any) => {
  resetFeedback()
  try {
    await setDoc(
      doc(db, 'ads', adItem.id),
      {
        active: !adItem.active,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    )
    feedback.value = 'Estado de publicidad actualizado.'
  } catch (error: any) {
    errorMessage.value = `Error al cambiar estado: ${error.message}`
  }
}

const removeAd = async (adId: string) => {
  const confirmed = window.confirm('Seguro que quieres eliminar esta publicidad?')
  if (!confirmed) return

  resetFeedback()
  deletingAdId.value = adId
  try {
    await deleteDoc(doc(db, 'ads', adId))
    feedback.value = 'Publicidad eliminada.'
    if (editingAdId.value === adId) resetAdForm()
  } catch (error: any) {
    errorMessage.value = `Error al eliminar publicidad: ${error.message}`
  } finally {
    deletingAdId.value = null
  }
}

const isTabChecked = (tab: FeedTab) => moduleForm.tabs.includes(tab)

const toggleTab = (tab: FeedTab) => {
  if (moduleForm.tabs.includes(tab)) {
    moduleForm.tabs = moduleForm.tabs.filter((current) => current !== tab)
  } else {
    moduleForm.tabs = [...moduleForm.tabs, tab]
  }
}

onMounted(() => {
  if (!isAuthorized.value) return
  loadAds()
  loadModuleConfig()
})

onBeforeUnmount(() => {
  if (unsubscribeAds) unsubscribeAds()
  if (unsubscribeConfig) unsubscribeConfig()
})
</script>

<template>
  <section class="ads-page">
    <header class="page-head">
      <h1>Panel de Publicidad (ADS)</h1>
      <p>Gestiona anuncios, estado del modulo y rendimiento.</p>
    </header>

    <div v-if="!isAuthorized" class="restricted-card">
      <h2>No tienes acceso a este modulo</h2>
      <p>Necesitas rol admin o colaborador para gestionar ADS.</p>
      <RouterLink to="/" class="go-home">Volver al inicio</RouterLink>
    </div>

    <template v-else>
      <p v-if="feedback" class="msg ok">{{ feedback }}</p>
      <p v-if="errorMessage" class="msg error">{{ errorMessage }}</p>

      <div class="grid">
        <article class="card">
          <h2>Configuracion del modulo ADS</h2>

          <label class="field inline">
            <input v-model="moduleForm.enabled" type="checkbox" />
            <span>Modulo ADS habilitado</span>
          </label>

          <div class="cols-2">
            <label class="field">
              <span>Max ADS por feed</span>
              <input v-model.number="moduleForm.maxAdsPerFeed" type="number" min="0" max="6" />
            </label>

            <label class="field">
              <span>Min posts entre ADS</span>
              <input
                v-model.number="moduleForm.minPostsBetweenAds"
                type="number"
                min="1"
                max="20"
              />
            </label>
          </div>

          <div class="cols-2">
            <label class="field">
              <span>Probabilidad (0 a 1)</span>
              <input
                v-model.number="moduleForm.probability"
                type="number"
                min="0"
                max="1"
                step="0.05"
              />
            </label>

            <label class="field">
              <span>Fetch limit ADS</span>
              <input v-model.number="moduleForm.fetchLimit" type="number" min="1" max="20" />
            </label>
          </div>

          <div class="cols-2">
            <label class="field">
              <span>Cooldown impresion (ms)</span>
              <input
                v-model.number="moduleForm.impressionCooldownMs"
                type="number"
                min="0"
                step="1000"
              />
            </label>

            <label class="field">
              <span>Cooldown click (ms)</span>
              <input
                v-model.number="moduleForm.clickCooldownMs"
                type="number"
                min="0"
                step="1000"
              />
            </label>
          </div>

          <div class="cols-2">
            <label class="field inline">
              <input v-model="moduleForm.trackImpressions" type="checkbox" />
              <span>Track impresiones</span>
            </label>
            <label class="field inline">
              <input v-model="moduleForm.trackClicks" type="checkbox" />
              <span>Track clicks</span>
            </label>
          </div>

          <div class="field">
            <span>Tabs con ADS</span>
            <div class="chips">
              <label class="chip">
                <input :checked="isTabChecked('todo')" type="checkbox" @change="toggleTab('todo')" />
                <span>Todos</span>
              </label>
              <label class="chip">
                <input :checked="isTabChecked('news')" type="checkbox" @change="toggleTab('news')" />
                <span>Noticias</span>
              </label>
              <label class="chip">
                <input :checked="isTabChecked('post')" type="checkbox" @change="toggleTab('post')" />
                <span>Comunidad</span>
              </label>
            </div>
          </div>

          <div class="actions">
            <button class="primary" :disabled="savingConfig" @click="saveModuleConfig">
              {{ savingConfig ? 'Guardando...' : 'Guardar configuracion' }}
            </button>
          </div>
        </article>

        <article class="card">
          <h2>{{ formTitle }}</h2>

          <label class="field">
            <span>Titulo</span>
            <input v-model="adForm.title" type="text" placeholder="Ej: Oferta exclusiva" />
          </label>

          <label class="field">
            <span>Descripcion</span>
            <textarea
              v-model="adForm.description"
              rows="3"
              placeholder="Texto breve del anuncio"
            />
          </label>

          <label class="field">
            <span>URL imagen</span>
            <input v-model="adForm.imageUrl" type="url" placeholder="https://..." />
          </label>

          <div class="cols-2">
            <label class="field">
              <span>URL destino</span>
              <input v-model="adForm.destinationUrl" type="text" placeholder="https://..." />
            </label>

            <label class="field">
              <span>CTA</span>
              <input v-model="adForm.ctaLabel" type="text" placeholder="Ver mas" />
            </label>
          </div>

          <div class="cols-2">
            <label class="field">
              <span>Prioridad (1..10)</span>
              <input v-model.number="adForm.priority" type="number" min="1" max="10" />
            </label>

            <label class="field inline">
              <input v-model="adForm.active" type="checkbox" />
              <span>Activo</span>
            </label>
          </div>

          <div class="cols-2">
            <label class="field">
              <span>Inicio (opcional)</span>
              <input v-model="adForm.startAt" type="datetime-local" />
            </label>

            <label class="field">
              <span>Fin (opcional)</span>
              <input v-model="adForm.endAt" type="datetime-local" />
            </label>
          </div>

          <div class="actions">
            <button class="primary" :disabled="savingAd" @click="saveAd">
              {{ savingAd ? 'Guardando...' : editingAdId ? 'Actualizar ADS' : 'Crear ADS' }}
            </button>
            <button class="ghost" :disabled="savingAd" @click="resetAdForm">Limpiar</button>
          </div>
        </article>
      </div>

      <article class="card list-card">
        <h2>Publicidades cargadas</h2>
        <p v-if="loadingAds">Cargando ADS...</p>
        <p v-else-if="ads.length === 0">Aun no hay publicidades.</p>

        <div v-else class="ads-list">
          <div v-for="ad in ads" :key="ad.id" class="ad-item">
            <div class="ad-main">
              <img v-if="ad.imageUrl" :src="ad.imageUrl" class="thumb" alt="preview ad" />
              <div class="ad-text">
                <h3>{{ ad.title || 'Sin titulo' }}</h3>
                <p>{{ ad.description || 'Sin descripcion' }}</p>
                <small>
                  Prioridad {{ ad.priority || 0 }} | Estado:
                  <strong>{{ ad.active ? 'Activo' : 'Pausado' }}</strong>
                </small>
                <small>
                  Impresiones {{ ad.stats?.impressionsTotal || 0 }} | Clicks
                  {{ ad.stats?.clicksTotal || 0 }} | CTR {{ ad.stats?.ctr || 0 }}%
                </small>
              </div>
            </div>

            <div class="ad-actions">
              <button class="ghost" @click="setFormFromAd(ad)">Editar</button>
              <button class="ghost" @click="toggleAd(ad)">
                {{ ad.active ? 'Pausar' : 'Activar' }}
              </button>
              <button
                class="danger"
                :disabled="deletingAdId === ad.id"
                @click="removeAd(ad.id)"
              >
                {{ deletingAdId === ad.id ? 'Eliminando...' : 'Eliminar' }}
              </button>
            </div>
          </div>
        </div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.ads-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2rem;
}

.page-head h1 {
  margin: 0;
  color: var(--text-h);
}

.page-head p {
  margin: 0.35rem 0 0;
  color: var(--text);
}

.restricted-card,
.card {
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 16px;
  padding: 1rem;
  margin-top: 1rem;
}

.go-home {
  display: inline-block;
  margin-top: 0.7rem;
  color: var(--accent);
  text-decoration: none;
  font-weight: 700;
}

.msg {
  margin-top: 0.8rem;
  padding: 0.7rem 0.9rem;
  border-radius: 10px;
  font-weight: 600;
}

.msg.ok {
  background: #e8f7ee;
  color: #166534;
}

.msg.error {
  background: #feeceb;
  color: #991b1b;
}

.grid {
  margin-top: 1rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.cols-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.7rem;
}

.field.inline {
  flex-direction: row;
  align-items: center;
  gap: 0.55rem;
}

.field span {
  color: var(--text-h);
  font-weight: 600;
  font-size: 0.92rem;
}

.field input,
.field textarea {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
  border-radius: 10px;
  padding: 0.58rem 0.7rem;
  font: inherit;
}

.chips {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.35rem 0.65rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
}

.actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 1rem;
}

button {
  border: 0;
  border-radius: 10px;
  padding: 0.58rem 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

button.primary {
  background: var(--accent);
  color: #fff;
}

button.ghost {
  background: var(--social-bg);
  color: var(--text-h);
  border: 1px solid var(--border);
}

button.danger {
  background: #991b1b;
  color: #fff;
}

button:disabled {
  opacity: 0.65;
  cursor: default;
}

.list-card {
  margin-top: 1rem;
}

.ads-list {
  display: grid;
  gap: 0.85rem;
}

.ad-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.ad-main {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  min-width: 0;
}

.thumb {
  width: 68px;
  height: 68px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid var(--border);
}

.ad-text {
  min-width: 0;
}

.ad-text h3 {
  margin: 0;
  color: var(--text-h);
  font-size: 1rem;
}

.ad-text p {
  margin: 0.2rem 0 0.4rem;
  color: var(--text);
}

.ad-text small {
  display: block;
  color: var(--text);
}

.ad-actions {
  display: flex;
  gap: 0.45rem;
}

@media (max-width: 960px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .cols-2 {
    grid-template-columns: 1fr;
  }

  .ad-item {
    flex-direction: column;
    align-items: stretch;
  }

  .ad-actions {
    justify-content: flex-end;
  }
}
</style>
