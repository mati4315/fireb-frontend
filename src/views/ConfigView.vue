<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/config/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useModuleStore } from '@/stores/moduleStore'
import { useThemeStore } from '@/stores/themeStore'
import { isAdminUser } from '@/utils/roles'

type DefaultFeedTab = 'todo' | 'news' | 'post' | 'surveys' | 'lottery'
type ThemePreference = 'light' | 'dark'

const authStore = useAuthStore()
const moduleStore = useModuleStore()
const themeStore = useThemeStore()

const saving = ref(false)
const successMsg = ref('')
const errorMsg = ref('')
const selectedTab = ref<DefaultFeedTab>('todo')
const selectedTheme = ref<ThemePreference>(themeStore.isDark ? 'dark' : 'light')
const loadingPromotion = ref(false)
const savingPromotion = ref(false)
const promotionEnabled = ref(false)
const savedPromotionEnabled = ref(false)
const promotionExtraTickets = ref(1)
const promotionEndsAt = ref('')
const promotionSuccess = ref('')
const promotionError = ref('')
const homeNotices = ref<Array<{ id: string; title: string; message: string; endsAt: Date; icon: string }>>([])
const homeNoticeTitle = ref('')
const homeNoticeMessage = ref('')
const homeNoticeIcon = ref('📣')
const homeNoticeDuration = ref(24)
const homeNoticeDurationUnit = ref<'hours' | 'days'>('hours')
const homeNoticeSaving = ref(false)
const homeNoticeError = ref('')
const homeNoticeSuccess = ref('')
const autoEpisodeNoticeEnabled = ref(true)
const autoEpisodeNoticeDuration = ref(7)
const autoEpisodeNoticeUnit = ref<'hours' | 'days'>('days')
const autoEpisodeNoticeSaving = ref(false)
const autoEpisodeNoticeMessage = ref('')

const isAdmin = computed(() => isAdminUser(
  authStore.userProfile?.rol,
  authStore.user?.email || authStore.userProfile?.email,
  authStore.user?.uid,
  authStore.tokenClaims
))

const toDateTimeLocal = (date: Date): string => {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const loadPromotion = async () => {
  if (!isAdmin.value) return
  loadingPromotion.value = true
  promotionError.value = ''
  try {
    const snapshot = await getDoc(doc(db, '_config', 'lottery_new_user_promotion'))
    if (snapshot.exists()) {
      const data = snapshot.data()
      promotionEnabled.value = data.enabled === true
      savedPromotionEnabled.value = promotionEnabled.value
      promotionExtraTickets.value = Math.max(1, Math.min(5, Math.floor(Number(data.extraTickets) || 1)))
      const endDate = data.endsAt instanceof Timestamp ? data.endsAt.toDate() : null
      promotionEndsAt.value = endDate ? toDateTimeLocal(endDate) : ''
    } else {
      promotionEndsAt.value = toDateTimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
    }
  } catch (error: any) {
    promotionError.value = error?.message || 'No se pudo cargar la promoción.'
  } finally {
    loadingPromotion.value = false
  }
}

const loadHomeNotices = async () => {
  if (!isAdmin.value) return
  try {
    const [noticeSnapshot, settingsSnapshot] = await Promise.all([
      getDocs(collection(db, 'home_notices')),
      getDoc(doc(db, '_config', 'home_notice_settings'))
    ])
    const now = Date.now()
    homeNotices.value = noticeSnapshot.docs
      .map((noticeDoc) => {
        const data = noticeDoc.data()
        const endsAt = data.endsAt instanceof Timestamp ? data.endsAt.toDate() : null
        return {
          id: noticeDoc.id,
          title: typeof data.title === 'string' ? data.title : '',
          message: typeof data.message === 'string' ? data.message : '',
          icon: typeof data.icon === 'string' ? data.icon : '📣',
          endsAt
        }
      })
      .filter((notice): notice is typeof notice & { endsAt: Date } => Boolean(notice.title && notice.message && notice.endsAt && notice.endsAt.getTime() > now))
      .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())

    if (settingsSnapshot.exists()) {
      const data = settingsSnapshot.data()
      autoEpisodeNoticeEnabled.value = data.episodeEnabled !== false
      autoEpisodeNoticeDuration.value = Math.max(1, Math.min(30, Math.floor(Number(data.episodeDuration) || 7)))
      autoEpisodeNoticeUnit.value = data.episodeDurationUnit === 'hours' ? 'hours' : 'days'
    }
  } catch (error: any) {
    homeNoticeError.value = error?.message || 'No se pudieron cargar los avisos del Home.'
  }
}

const createHomeNotice = async () => {
  homeNoticeError.value = ''
  homeNoticeSuccess.value = ''
  const title = homeNoticeTitle.value.trim()
  const message = homeNoticeMessage.value.trim()
  const duration = Math.floor(Number(homeNoticeDuration.value))
  if (!title || title.length > 90 || !message || message.length > 500 || !Number.isFinite(duration) || duration < 1 || duration > 720) {
    homeNoticeError.value = 'Completa un título (máx. 90), un mensaje (máx. 500) y una duración entre 1 y 720 horas/días.'
    return
  }

  homeNoticeSaving.value = true
  try {
    const durationMs = duration * (homeNoticeDurationUnit.value === 'days' ? 24 : 1) * 60 * 60 * 1000
    const now = Date.now()
    const created = await addDoc(collection(db, 'home_notices'), {
      title,
      message,
      icon: homeNoticeIcon.value.trim().slice(0, 8) || '📣',
      startsAt: Timestamp.fromMillis(now),
      endsAt: Timestamp.fromMillis(now + durationMs),
      createdAt: serverTimestamp()
    })
    homeNotices.value.unshift({
      id: created.id,
      title,
      message,
      icon: homeNoticeIcon.value.trim().slice(0, 8) || '📣',
      endsAt: new Date(now + durationMs)
    })
    homeNoticeTitle.value = ''
    homeNoticeMessage.value = ''
    homeNoticeSuccess.value = 'Aviso publicado en el Home.'
  } catch (error: any) {
    homeNoticeError.value = error?.message || 'No se pudo publicar el aviso.'
  } finally {
    homeNoticeSaving.value = false
  }
}

const removeHomeNotice = async (noticeId: string) => {
  homeNoticeError.value = ''
  try {
    await deleteDoc(doc(db, 'home_notices', noticeId))
    homeNotices.value = homeNotices.value.filter((notice) => notice.id !== noticeId)
  } catch (error: any) {
    homeNoticeError.value = error?.message || 'No se pudo quitar el aviso.'
  }
}

const saveAutoEpisodeNotice = async () => {
  autoEpisodeNoticeMessage.value = ''
  const duration = Math.floor(Number(autoEpisodeNoticeDuration.value))
  if (!Number.isFinite(duration) || duration < 1 || duration > 30) {
    autoEpisodeNoticeMessage.value = 'La duración debe estar entre 1 y 30 horas o días.'
    return
  }
  autoEpisodeNoticeSaving.value = true
  try {
    await setDoc(doc(db, '_config', 'home_notice_settings'), {
      episodeEnabled: autoEpisodeNoticeEnabled.value,
      episodeDuration: duration,
      episodeDurationUnit: autoEpisodeNoticeUnit.value,
      updatedAt: serverTimestamp()
    }, { merge: true })
    autoEpisodeNoticeMessage.value = 'Configuración automática guardada.'
  } catch (error: any) {
    autoEpisodeNoticeMessage.value = error?.message || 'No se pudo guardar la configuración automática.'
  } finally {
    autoEpisodeNoticeSaving.value = false
  }
}

const savePromotion = async () => {
  promotionSuccess.value = ''
  promotionError.value = ''
  const endsAt = promotionEndsAt.value ? new Date(promotionEndsAt.value) : null
  if (promotionEnabled.value && (!endsAt || Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= Date.now())) {
    promotionError.value = 'Elige una fecha y hora futura para finalizar la promoción.'
    return
  }

  savingPromotion.value = true
  try {
    const promotionRef = doc(db, '_config', 'lottery_new_user_promotion')
    const existing = await getDoc(promotionRef)
    const existingData = existing.exists() ? existing.data() : {}
    const startsAt = promotionEnabled.value && !savedPromotionEnabled.value
      ? Timestamp.now()
      : existingData.startsAt instanceof Timestamp
        ? existingData.startsAt
        : Timestamp.now()

    await setDoc(promotionRef, {
      enabled: promotionEnabled.value,
      extraTickets: Math.max(1, Math.min(5, Math.floor(Number(promotionExtraTickets.value) || 1))),
      startsAt,
      endsAt: endsAt ? Timestamp.fromDate(endsAt) : null,
      updatedAt: serverTimestamp(),
      updatedBy: authStore.user?.uid || ''
    }, { merge: true })

    savedPromotionEnabled.value = promotionEnabled.value
    promotionSuccess.value = promotionEnabled.value
      ? 'Promoción guardada. Los nuevos registros dentro de la vigencia recibirán el bono en loterías gratuitas.'
      : 'Promoción desactivada.'
  } catch (error: any) {
    promotionError.value = error?.message || 'No se pudo guardar la promoción.'
  } finally {
    savingPromotion.value = false
  }
}

const feedOptions: Array<{
  key: DefaultFeedTab
  label: string
  description: string
}> = [
  { key: 'todo', label: 'Todos', description: 'Muestra noticias, comunidad y el resto del feed.' },
  { key: 'news', label: 'Noticias', description: 'Abre el home directamente en noticias.' },
  { key: 'post', label: 'Comunidad', description: 'Abre el home directamente en comunidad.' },
  { key: 'surveys', label: 'Encuestas', description: 'Abre el home directamente en encuestas.' },
  { key: 'lottery', label: 'Loteria', description: 'Abre el home directamente en loteria.' }
]

const normalizeDefaultFeedTab = (value: unknown): DefaultFeedTab => {
  if (value === 'news' || value === 'post' || value === 'surveys' || value === 'lottery') {
    return value
  }
  return 'todo'
}

const currentSavedTab = computed<DefaultFeedTab>(() =>
  normalizeDefaultFeedTab(authStore.userProfile?.settings?.defaultFeedTab)
)

const currentSavedTheme = computed<ThemePreference>(() => {
  const preference = authStore.userProfile?.settings?.themePreference
  if (preference === 'light' || preference === 'dark') return preference
  return themeStore.isDark ? 'dark' : 'light'
})

const hasChanges = computed(() =>
  selectedTab.value !== currentSavedTab.value || selectedTheme.value !== currentSavedTheme.value
)

const isOptionCurrentlyEnabled = (tab: DefaultFeedTab): boolean => {
  if (tab === 'todo') return true
  if (tab === 'news') return moduleStore.modules.news.enabled
  if (tab === 'post') return moduleStore.modules.community.enabled
  if (tab === 'surveys') return moduleStore.modules.surveys.enabled
  return moduleStore.modules.lottery.enabled
}

const saveSettings = async () => {
  successMsg.value = ''
  errorMsg.value = ''
  saving.value = true
  try {
    await authStore.updateDefaultFeedTabPreference(selectedTab.value, selectedTheme.value)
    themeStore.setTheme(selectedTheme.value === 'dark')
    successMsg.value = 'Configuracion guardada correctamente.'
  } catch (error: any) {
    errorMsg.value = error?.message || 'No se pudo guardar la configuracion.'
  } finally {
    saving.value = false
  }
}

watch(
  () => currentSavedTab.value,
  (nextValue) => {
    selectedTab.value = nextValue
  },
  { immediate: true }
)

watch(
  () => currentSavedTheme.value,
  (nextValue) => {
    selectedTheme.value = nextValue
  },
  { immediate: true }
)

watch(isAdmin, (allowed) => {
  if (allowed) {
    void loadPromotion()
    void loadHomeNotices()
  }
}, { immediate: true })

onMounted(() => {
  moduleStore.initModulesListener()
})
</script>

<template>
  <section class="config-page">
    <header class="header">
      <h1>Configuracion</h1>
      <p class="subtitle">Personaliza como quieres iniciar el feed cuando entras a cdelu.ar.</p>
    </header>

    <section v-if="isAdmin" class="card promotion-card">
      <div class="promotion-heading">
        <div>
          <p class="promotion-kicker">ACCIONES Y PROMOCIONES</p>
          <h2>Tickets de bienvenida</h2>
        </div>
        <span class="promotion-icon" aria-hidden="true">🎟️</span>
      </div>
      <p class="hint">
        Otorga tickets extra a las cuentas creadas durante la vigencia. El bono se aplica automáticamente en todas las loterías gratuitas; las cuentas anteriores no califican.
      </p>

      <p v-if="loadingPromotion" class="promotion-status">Cargando promoción...</p>
      <template v-else>
        <label class="promotion-toggle">
          <input v-model="promotionEnabled" type="checkbox">
          <span>
            <strong>Activar promoción</strong>
            <small>Al activarla comienza la ventana para nuevos registros.</small>
          </span>
        </label>

        <div class="promotion-fields">
          <label class="promotion-field">
            Tickets extra por lotería gratuita
            <input v-model.number="promotionExtraTickets" type="number" min="1" max="5" step="1" :disabled="!promotionEnabled">
          </label>
          <label class="promotion-field">
            Vigente hasta
            <input v-model="promotionEndsAt" type="datetime-local" :disabled="!promotionEnabled" required>
          </label>
        </div>

        <div class="promotion-actions">
          <button class="save-btn" :disabled="savingPromotion || loadingPromotion" @click="savePromotion">
            {{ savingPromotion ? 'Guardando...' : 'Guardar promoción' }}
          </button>
          <span v-if="promotionSuccess" class="ok-msg" role="status">{{ promotionSuccess }}</span>
          <span v-if="promotionError" class="error-msg" role="alert">{{ promotionError }}</span>
        </div>
      </template>
    </section>

    <section v-if="isAdmin" class="card home-notice-admin-card">
      <div class="promotion-heading">
        <div>
          <p class="promotion-kicker">MENSAJES DESTACADOS</p>
          <h2>Avisos del Home</h2>
        </div>
        <span class="promotion-icon notice-admin-icon" aria-hidden="true">📣</span>
      </div>
      <p class="hint">Publica avisos visibles sobre el feed. Cada aviso desaparece automáticamente al vencer.</p>

      <div class="notice-create-grid">
        <label class="promotion-field">
          Título
          <input v-model="homeNoticeTitle" maxlength="90" placeholder="Ej.: Nuevo episodio disponible">
        </label>
        <label class="promotion-field notice-icon-field">
          Icono
          <input v-model="homeNoticeIcon" maxlength="8" aria-label="Icono del aviso">
        </label>
        <label class="promotion-field notice-message-field">
          Mensaje
          <textarea v-model="homeNoticeMessage" maxlength="500" rows="3" placeholder="Escribe el aviso que verán los visitantes."></textarea>
        </label>
        <label class="promotion-field">
          Duración
          <span class="duration-input-row">
            <input v-model.number="homeNoticeDuration" type="number" min="1" max="720">
            <select v-model="homeNoticeDurationUnit" aria-label="Unidad de duración">
              <option value="hours">Horas</option>
              <option value="days">Días</option>
            </select>
          </span>
        </label>
      </div>
      <div class="promotion-actions">
        <button class="save-btn" :disabled="homeNoticeSaving" @click="createHomeNotice">
          {{ homeNoticeSaving ? 'Publicando...' : 'Publicar aviso' }}
        </button>
        <span v-if="homeNoticeSuccess" class="ok-msg" role="status">{{ homeNoticeSuccess }}</span>
        <span v-if="homeNoticeError" class="error-msg" role="alert">{{ homeNoticeError }}</span>
      </div>

      <div class="automatic-notice-settings">
        <h3>Estreno de Anormalia 22</h3>
        <p class="hint">Al agregar un episodio publicado nuevo, se mostrará automáticamente en el Home durante el tiempo elegido.</p>
        <label class="promotion-toggle">
          <input v-model="autoEpisodeNoticeEnabled" type="checkbox">
          <span><strong>Anunciar episodios nuevos</strong><small>El aviso enlaza al episodio en Anormalia 22.</small></span>
        </label>
        <label class="promotion-field auto-duration-field">
          Mostrar durante
          <span class="duration-input-row">
            <input v-model.number="autoEpisodeNoticeDuration" type="number" min="1" max="30" :disabled="!autoEpisodeNoticeEnabled">
            <select v-model="autoEpisodeNoticeUnit" :disabled="!autoEpisodeNoticeEnabled" aria-label="Unidad de duración automática">
              <option value="hours">Horas</option>
              <option value="days">Días</option>
            </select>
          </span>
        </label>
        <div class="promotion-actions">
          <button class="save-btn" :disabled="autoEpisodeNoticeSaving" @click="saveAutoEpisodeNotice">
            {{ autoEpisodeNoticeSaving ? 'Guardando...' : 'Guardar automatización' }}
          </button>
          <span v-if="autoEpisodeNoticeMessage" class="ok-msg" role="status">{{ autoEpisodeNoticeMessage }}</span>
        </div>
      </div>

      <div class="managed-notice-list">
        <h3>Avisos manuales vigentes</h3>
        <p v-if="homeNotices.length === 0" class="promotion-status">No hay avisos manuales vigentes.</p>
        <article v-for="notice in homeNotices" :key="notice.id" class="managed-notice-item">
          <span class="managed-notice-icon" aria-hidden="true">{{ notice.icon }}</span>
          <div><strong>{{ notice.title }}</strong><p>{{ notice.message }}</p><small>Vence {{ notice.endsAt.toLocaleString('es-AR') }}</small></div>
          <button type="button" class="remove-notice-btn" :aria-label="`Quitar aviso ${notice.title}`" @click="removeHomeNotice(notice.id)">Quitar</button>
        </article>
      </div>
    </section>

    <section class="card">
      <h2>Feed por defecto</h2>
      <p class="hint">Al abrir el home (`/`), te llevaremos automaticamente a la seccion elegida.</p>

      <div class="options-list">
        <label v-for="option in feedOptions" :key="option.key" class="option-item">
          <input
            v-model="selectedTab"
            type="radio"
            name="default-feed-tab"
            :value="option.key"
          >
          <span class="option-content">
            <span class="option-title">
              {{ option.label }}
              <small v-if="!isOptionCurrentlyEnabled(option.key)" class="option-disabled-tag">
                modulo desactivado
              </small>
            </span>
            <span class="option-description">{{ option.description }}</span>
          </span>
        </label>
      </div>

      <div class="preference-divider">
        <h2>Tema de la aplicacion</h2>
        <p class="hint">Elige si prefieres usar CDELU en tema claro u oscuro.</p>
      </div>

      <div class="options-list">
        <label class="option-item">
          <input v-model="selectedTheme" type="radio" name="theme-preference" value="light">
          <span class="option-content">
            <span class="option-title">Claro</span>
            <span class="option-description">Fondo claro y texto oscuro.</span>
          </span>
        </label>
        <label class="option-item">
          <input v-model="selectedTheme" type="radio" name="theme-preference" value="dark">
          <span class="option-content">
            <span class="option-title">Oscuro</span>
            <span class="option-description">Fondo oscuro y texto claro.</span>
          </span>
        </label>
      </div>

      <div class="actions">
        <button class="save-btn" :disabled="saving || !hasChanges" @click="saveSettings">
          {{ saving ? 'Guardando...' : 'Guardar cambios' }}
        </button>
      </div>

      <p v-if="successMsg" class="ok-msg">{{ successMsg }}</p>
      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    </section>
  </section>
</template>

<style scoped>
.config-page {
  width: min(900px, 100%);
  margin: 0 auto;
  padding: 1.25rem 1rem 2rem;
  display: grid;
  gap: 1rem;
}

.header h1 {
  margin: 0;
  font-size: clamp(1.35rem, 2.6vw, 1.9rem);
}

.subtitle {
  margin: 0.35rem 0 0;
  color: var(--text);
}

.card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
}

.promotion-card {
  border-color: color-mix(in srgb, #d99a22 45%, var(--border));
  background:
    radial-gradient(ellipse at 100% 0%, rgba(235, 183, 63, 0.12), transparent 42%),
    var(--card-bg);
}

.home-notice-admin-card {
  display: grid;
  gap: 0.85rem;
  border-color: color-mix(in srgb, #e68636 30%, var(--border));
}

.notice-admin-icon {
  background: color-mix(in srgb, #e68636 16%, var(--card-bg));
}

.notice-create-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 100px minmax(0, 1fr);
  gap: 0.75rem;
}

.notice-message-field {
  grid-column: 1 / 3;
}

.promotion-field textarea,
.duration-input-row input,
.duration-input-row select {
  width: 100%;
  min-width: 0;
  padding: 0.62rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg);
  color: var(--text-h);
  font: inherit;
  font-weight: 400;
  box-sizing: border-box;
}

.promotion-field textarea {
  resize: vertical;
}

.duration-input-row {
  display: flex;
  gap: 0.4rem;
}

.duration-input-row select {
  flex: 0 0 6.4rem;
}

.automatic-notice-settings,
.managed-notice-list {
  padding-top: 0.9rem;
  border-top: 1px solid var(--border);
}

.automatic-notice-settings h3,
.managed-notice-list h3 {
  margin: 0;
  color: var(--text-h);
  font-size: 0.98rem;
}

.automatic-notice-settings .hint {
  margin-bottom: 0.4rem;
}

.auto-duration-field {
  max-width: 20rem;
}

.managed-notice-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.7rem;
  margin-top: 0.65rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: color-mix(in srgb, var(--card-bg) 92%, var(--accent));
}

.managed-notice-icon {
  font-size: 1.25rem;
}

.managed-notice-item strong {
  color: var(--text-h);
  font-size: 0.9rem;
}

.managed-notice-item p {
  margin: 0.2rem 0;
  color: var(--text);
  font-size: 0.84rem;
  overflow-wrap: anywhere;
}

.managed-notice-item small {
  color: var(--text);
  font-size: 0.72rem;
}

.remove-notice-btn {
  padding: 0.4rem 0.65rem;
  border: 1px solid color-mix(in srgb, #b8463b 35%, var(--border));
  border-radius: 8px;
  background: transparent;
  color: #b8463b;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.promotion-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.promotion-heading h2 {
  margin: 0;
  color: var(--text-h);
  font-size: 1.15rem;
}

.promotion-kicker {
  margin: 0 0 0.2rem;
  color: #9b6810;
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.12em;
}

.promotion-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: #fff2cc;
  font-size: 1.2rem;
}

.promotion-toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  margin: 1rem 0;
  padding: 0.8rem;
  border: 1px solid var(--border);
  border-radius: 11px;
  cursor: pointer;
}

.promotion-toggle input {
  margin-top: 0.22rem;
  accent-color: #39834e;
}

.promotion-toggle span {
  display: grid;
  gap: 0.2rem;
}

.promotion-toggle strong,
.promotion-field {
  color: var(--text-h);
  font-size: 0.88rem;
}

.promotion-toggle small {
  color: var(--text);
  font-size: 0.8rem;
}

.promotion-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.promotion-field {
  display: grid;
  gap: 0.4rem;
  font-weight: 700;
}

.promotion-field input {
  width: 100%;
  min-width: 0;
  padding: 0.62rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg);
  color: var(--text-h);
  font: inherit;
  font-weight: 400;
}

.promotion-field input:disabled {
  opacity: 0.58;
}

.promotion-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 1rem;
}

.promotion-actions .ok-msg,
.promotion-actions .error-msg {
  margin: 0;
  font-size: 0.82rem;
}

.promotion-status {
  margin: 0;
  color: var(--text);
}

.card h2 {
  margin: 0;
  font-size: 1.05rem;
}

.hint {
  margin: 0.4rem 0 0.9rem;
  color: var(--text);
  font-size: 0.92rem;
}

.preference-divider {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.preference-divider h2 {
  margin: 0;
  font-size: 1.05rem;
}

.options-list {
  display: grid;
  gap: 0.55rem;
}

.option-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  cursor: pointer;
}

.option-item input {
  margin-top: 0.18rem;
}

.option-content {
  display: grid;
  gap: 0.2rem;
}

.option-title {
  font-weight: 700;
  color: var(--text-h);
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.option-disabled-tag {
  font-weight: 600;
  font-size: 0.72rem;
  color: #b45309;
}

.option-description {
  color: var(--text);
  font-size: 0.86rem;
}

.actions {
  margin-top: 0.9rem;
}

.save-btn {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  border-radius: 10px;
  padding: 0.58rem 0.95rem;
  font-weight: 700;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.ok-msg {
  margin: 0.75rem 0 0;
  color: #0c9b49;
}

.error-msg {
  margin: 0.75rem 0 0;
  color: #c53a3a;
}

@media (max-width: 760px) {
  .config-page {
    padding: 1rem 0.75rem 1.5rem;
  }

  .promotion-fields {
    grid-template-columns: 1fr;
  }

  .notice-create-grid {
    grid-template-columns: minmax(0, 1fr) 82px;
  }

  .notice-message-field {
    grid-column: 1 / -1;
  }

  .promotion-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
