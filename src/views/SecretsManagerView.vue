<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db } from '@/config/firebase'
import { functions as firebaseFunctions } from '@/config/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useModuleStore } from '@/stores/moduleStore'
import { isAdminUser, isStaffUser } from '@/utils/roles'

type SecretSettingsForm = {
  maxTextLength: number
  minTextLength: number
  createCooldownMinutes: number
  commentCooldownSeconds: number
  dailyLimit: number
  autoHideReportsThreshold: number
}

type SecretReport = {
  reportId: string
  secretId: string
  reason: string
  comment: string
  status: 'pending' | 'resolved' | 'dismissed'
  createdAtMs: number
  reviewedAtMs: number
  reviewedBy: string
  secret: {
    textPreview: string
    category: string
    zone: string
    moderationStatus: string
    reportsCount: number
  }
}

const authStore = useAuthStore()
const moduleStore = useModuleStore()

const moduleEnabled = ref(true)
const savingModuleConfig = ref(false)
const savingSettings = ref(false)
const feedback = ref('')
const errorMessage = ref('')
const activeTab = ref<'settings' | 'reports'>('settings')
const reportFilter = ref<'all' | 'pending' | 'resolved' | 'dismissed'>('pending')
const reports = ref<SecretReport[]>([])
const reportsLoading = ref(false)
const reportActionPending = ref<string | null>(null)
const unsubscribeSecretSettings = ref<(() => void) | null>(null)

const settingsForm = reactive<SecretSettingsForm>({
  maxTextLength: 280,
  minTextLength: 12,
  createCooldownMinutes: 30, // 30 minutes burst window
  commentCooldownSeconds: 20,
  dailyLimit: 10,
  autoHideReportsThreshold: 6
})

const isAuthorized = computed(() => {
  const rol = authStore.userProfile?.rol
  const email = authStore.user?.email || authStore.userProfile?.email
  const uid = authStore.user?.uid
  return authStore.isAuthenticated && isStaffUser(rol, email, uid, authStore.tokenClaims)
})

const isAdminAuthorized = computed(() => {
  const rol = authStore.userProfile?.rol
  const email = authStore.user?.email || authStore.userProfile?.email
  const uid = authStore.user?.uid
  return authStore.isAuthenticated && isAdminUser(rol, email, uid, authStore.tokenClaims)
})

const resetFeedback = () => {
  feedback.value = ''
  errorMessage.value = ''
}

const loadSecretSettings = () => {
  if (unsubscribeSecretSettings.value) {
    unsubscribeSecretSettings.value()
    unsubscribeSecretSettings.value = null
  }

  unsubscribeSecretSettings.value = onSnapshot(
    doc(db, '_config', 'secret_settings'),
    (snapshot) => {
      const data = snapshot.data() || {}
      settingsForm.maxTextLength = Number(data.maxTextLength ?? settingsForm.maxTextLength)
      settingsForm.minTextLength = Number(data.minTextLength ?? settingsForm.minTextLength)
      settingsForm.createCooldownMinutes = Number(
        data.createCooldownMinutes ?? settingsForm.createCooldownMinutes
      )
      settingsForm.commentCooldownSeconds = Number(
        data.commentCooldownSeconds ?? settingsForm.commentCooldownSeconds
      )
      settingsForm.dailyLimit = Number(data.dailyLimit ?? settingsForm.dailyLimit)
      settingsForm.autoHideReportsThreshold = Number(
        data.autoHideReportsThreshold ?? settingsForm.autoHideReportsThreshold
      )
    },
    (error) => {
      errorMessage.value = `No se pudo cargar configuracion de secretos: ${error.message}`
    }
  )
}

const saveModuleConfig = async () => {
  resetFeedback()
  savingModuleConfig.value = true
  try {
    await setDoc(
      doc(db, '_config', 'modules'),
      {
        secrets: {
          enabled: Boolean(moduleEnabled.value)
        }
      },
      { merge: true }
    )
    feedback.value = 'Configuracion del modulo de secretos actualizada.'
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo guardar la configuracion del modulo.'
  } finally {
    savingModuleConfig.value = false
  }
}

const saveFutureSettings = async () => {
  resetFeedback()
  savingSettings.value = true
  try {
    await setDoc(
      doc(db, '_config', 'secret_settings'),
      {
        maxTextLength: Math.max(120, Math.min(500, Number(settingsForm.maxTextLength || 280))),
        minTextLength: Math.max(1, Math.min(80, Number(settingsForm.minTextLength || 12))),
        createCooldownMinutes: Math.max(
          1,
          Math.min(240, Number(settingsForm.createCooldownMinutes || 30))
        ),
        commentCooldownSeconds: Math.max(
          1,
          Math.min(300, Number(settingsForm.commentCooldownSeconds || 20))
        ),
        dailyLimit: Math.max(1, Math.min(30, Number(settingsForm.dailyLimit || 5))),
        autoHideReportsThreshold: Math.max(
          1,
          Math.min(100, Number(settingsForm.autoHideReportsThreshold || 6))
        ),
        updatedAt: serverTimestamp(),
        updatedBy: authStore.user?.uid || null
      },
      { merge: true }
    )
    feedback.value = 'Configuraciones futuras de secretos guardadas.'
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudieron guardar las configuraciones futuras.'
  } finally {
    savingSettings.value = false
  }
}

const reportReasonLabels: Record<string, string> = {
  contenido_inapropiado: 'Contenido inapropiado',
  acoso: 'Acoso',
  odio_discriminacion: 'Odio o discriminación',
  violencia_amenazas: 'Violencia o amenazas',
  spam_publicidad: 'Spam o publicidad',
  informacion_personal: 'Información personal',
  otros: 'Otros'
}

const formatReportDate = (value: number) => {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value))
}

const getReportReasonLabel = (reason: string) => reportReasonLabels[reason] || reason || 'Sin motivo'

const loadReports = async () => {
  if (!isAdminAuthorized.value) return
  reportsLoading.value = true
  errorMessage.value = ''
  try {
    const callable = httpsCallable(firebaseFunctions, 'getSecretReportsCallable')
    const result = await callable({ status: reportFilter.value, limit: 100 })
    reports.value = (result.data as { items?: SecretReport[] })?.items || []
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudieron cargar los reportes.'
  } finally {
    reportsLoading.value = false
  }
}

const updateReportStatus = async (report: SecretReport, action: 'resolve' | 'dismiss' | 'reopen') => {
  reportActionPending.value = report.reportId
  errorMessage.value = ''
  try {
    const callable = httpsCallable(firebaseFunctions, 'moderateSecretReportCallable')
    await callable({ secretId: report.secretId, reportId: report.reportId, action })
    await loadReports()
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo actualizar el reporte.'
  } finally {
    reportActionPending.value = null
  }
}

watch(
  () => moduleStore.modules.secrets.enabled,
  (enabled) => {
    moduleEnabled.value = enabled
  },
  { immediate: true }
)

onMounted(() => {
  if (!isAuthorized.value) return
  moduleStore.initModulesListener()
  loadSecretSettings()
  loadReports()
})

onBeforeUnmount(() => {
  if (unsubscribeSecretSettings.value) {
    unsubscribeSecretSettings.value()
    unsubscribeSecretSettings.value = null
  }
})
</script>

<template>
  <section class="secrets-page">
    <header class="page-head">
      <h1>Gestion de Secretos</h1>
      <p>Activa o desactiva el modulo y centraliza configuraciones futuras de Secretos.</p>
    </header>

    <div v-if="!isAuthorized" class="restricted-card">
      <h2>No tienes acceso a este modulo</h2>
      <p>Necesitas rol admin o colaborador para gestionar Secretos.</p>
      <RouterLink to="/" class="go-home">Volver al inicio</RouterLink>
    </div>

    <template v-else>
      <p v-if="feedback" class="msg ok">{{ feedback }}</p>
      <p v-if="errorMessage" class="msg error">{{ errorMessage }}</p>

      <nav class="admin-tabs" aria-label="Secciones de secretos">
        <button :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'">
          Configuración
        </button>
        <button
          v-if="isAdminAuthorized"
          :class="{ active: activeTab === 'reports' }"
          @click="activeTab = 'reports'; loadReports()"
        >
          Reportes
          <span v-if="reports.length > 0" class="tab-count">{{ reports.length }}</span>
        </button>
      </nav>

      <div v-if="activeTab === 'settings'" class="grid">
        <article class="card">
          <h2>Configuracion del modulo</h2>
          <label class="field inline">
            <input v-model="moduleEnabled" type="checkbox" />
            <span>Modulo Secretos habilitado</span>
          </label>

          <div class="actions">
            <button class="primary" :disabled="savingModuleConfig" @click="saveModuleConfig">
              {{ savingModuleConfig ? 'Guardando...' : 'Guardar configuracion' }}
            </button>
          </div>
        </article>

        <article class="card">
          <h2>Configuraciones futuras</h2>
          <p class="hint">
            Estos valores quedan listos para las siguientes mejoras sin tocar de nuevo la interfaz.
          </p>

          <div class="cols-2">
            <label class="field">
              <span>Maximo caracteres</span>
              <input v-model.number="settingsForm.maxTextLength" type="number" min="120" max="500" />
            </label>
            <label class="field">
              <span>Minimo caracteres</span>
              <input v-model.number="settingsForm.minTextLength" type="number" min="1" max="80" />
            </label>
          </div>

          <div class="cols-2">
            <label class="field">
              <span>Cooldown publicar (min)</span>
              <input
                v-model.number="settingsForm.createCooldownMinutes"
                type="number"
                min="1"
                max="240"
              />
            </label>
            <label class="field">
              <span>Cooldown comentar (seg)</span>
              <input
                v-model.number="settingsForm.commentCooldownSeconds"
                type="number"
                min="1"
                max="300"
              />
            </label>
          </div>

          <div class="cols-2">
            <label class="field">
              <span>Limite diario</span>
              <input v-model.number="settingsForm.dailyLimit" type="number" min="1" max="30" />
            </label>
            <label class="field">
              <span>Umbral auto-ocultar reportes</span>
              <input
                v-model.number="settingsForm.autoHideReportsThreshold"
                type="number"
                min="1"
                max="100"
              />
            </label>
          </div>

          <div class="actions">
            <button class="primary" :disabled="savingSettings" @click="saveFutureSettings">
              {{ savingSettings ? 'Guardando...' : 'Guardar configuraciones futuras' }}
            </button>
          </div>
        </article>
      </div>

      <section v-else class="reports-panel">
        <div class="reports-toolbar">
          <div>
            <h2>Reportes de secretos</h2>
            <p class="hint">Revisa los motivos enviados por los usuarios y marca cada reporte.</p>
          </div>
          <div class="reports-toolbar-actions">
            <select v-model="reportFilter" @change="loadReports">
              <option value="pending">Pendientes</option>
              <option value="resolved">Resueltos</option>
              <option value="dismissed">Descartados</option>
              <option value="all">Todos</option>
            </select>
            <button class="secondary" :disabled="reportsLoading" @click="loadReports">
              {{ reportsLoading ? 'Cargando...' : 'Actualizar' }}
            </button>
          </div>
        </div>

        <p v-if="reportsLoading" class="empty-state">Cargando reportes...</p>
        <p v-else-if="reports.length === 0" class="empty-state">No hay reportes para este filtro.</p>
        <div v-else class="reports-list">
          <article v-for="report in reports" :key="report.reportId" class="report-card">
            <div class="report-card-head">
              <div>
                <strong>{{ getReportReasonLabel(report.reason) }}</strong>
                <span class="report-date">{{ formatReportDate(report.createdAtMs) }}</span>
              </div>
              <span class="status-pill" :class="`status-${report.status}`">{{ report.status }}</span>
            </div>
            <p class="report-secret-meta">
              Secreto {{ report.secretId }} · {{ report.secret.reportsCount }} reporte(s) · Moderación: {{ report.secret.moderationStatus }}
            </p>
            <p class="report-secret-text">{{ report.secret.textPreview || 'Sin texto disponible' }}</p>
            <p v-if="report.comment" class="report-comment"><strong>Comentario:</strong> {{ report.comment }}</p>
            <div class="report-actions">
              <button
                v-if="report.status !== 'resolved'"
                class="primary"
                :disabled="reportActionPending === report.reportId"
                @click="updateReportStatus(report, 'resolve')"
              >
                Resolver
              </button>
              <button
                v-if="report.status !== 'dismissed'"
                class="secondary"
                :disabled="reportActionPending === report.reportId"
                @click="updateReportStatus(report, 'dismiss')"
              >
                Descartar
              </button>
              <button
                v-if="report.status !== 'pending'"
                class="secondary"
                :disabled="reportActionPending === report.reportId"
                @click="updateReportStatus(report, 'reopen')"
              >
                Reabrir
              </button>
            </div>
          </article>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.secrets-page {
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

.admin-tabs {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  border-bottom: 1px solid var(--border);
}

.admin-tabs button {
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: var(--text);
  padding: 0.7rem 0.9rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.admin-tabs button.active {
  border-bottom-color: var(--accent);
  color: var(--text-h);
}

.tab-count {
  display: inline-grid;
  place-items: center;
  min-width: 1.2rem;
  height: 1.2rem;
  margin-left: 0.3rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 0.72rem;
}

.reports-panel {
  margin-top: 1rem;
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 16px;
  padding: 1rem;
}

.reports-toolbar,
.report-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.reports-toolbar h2 {
  margin: 0;
  color: var(--text-h);
}

.reports-toolbar .hint {
  margin-bottom: 0;
}

.reports-toolbar-actions,
.report-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.reports-toolbar-actions select,
.secondary {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-h);
  padding: 0.55rem 0.7rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.reports-list {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
}

.report-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.85rem;
  background: var(--bg);
}

.report-card-head strong {
  display: block;
  color: var(--text-h);
}

.report-date,
.report-secret-meta,
.report-secret-text,
.report-comment {
  color: var(--text);
  font-size: 0.86rem;
}

.report-date {
  display: block;
  margin-top: 0.2rem;
}

.report-secret-meta,
.report-secret-text,
.report-comment {
  margin: 0.65rem 0 0;
}

.report-secret-text {
  line-height: 1.45;
  white-space: pre-wrap;
}

.status-pill {
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: capitalize;
}

.status-pending {
  background: #fff4cc;
  color: #7a4f01;
}

.status-resolved {
  background: #e8f7ee;
  color: #166534;
}

.status-dismissed {
  background: #eef2f6;
  color: #475467;
}

.report-actions {
  margin-top: 0.8rem;
}

.empty-state {
  margin: 1rem 0 0;
  color: var(--text);
}

.hint {
  margin: 0.3rem 0 0.7rem;
  color: var(--text);
  font-size: 0.9rem;
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
  margin-bottom: 0.75rem;
}

.field.inline {
  flex-direction: row;
  align-items: center;
  margin-bottom: 0;
}

.field span {
  color: var(--text-h);
  font-weight: 600;
  font-size: 0.9rem;
}

.field input,
.field select {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
  border-radius: 10px;
  padding: 0.6rem 0.7rem;
  font: inherit;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.5rem;
}

.primary {
  border: 0;
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.65;
  cursor: default;
}

@media (max-width: 900px) {
  .grid,
  .cols-2 {
    grid-template-columns: 1fr;
  }

  .reports-toolbar,
  .report-card-head {
    flex-direction: column;
  }
}
</style>
