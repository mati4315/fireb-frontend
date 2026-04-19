<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/config/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useModuleStore } from '@/stores/moduleStore'
import { isStaffUser } from '@/utils/roles'

type SecretSettingsForm = {
  maxTextLength: number
  minTextLength: number
  createCooldownMinutes: number
  commentCooldownSeconds: number
  dailyLimit: number
  autoHideReportsThreshold: number
}

const authStore = useAuthStore()
const moduleStore = useModuleStore()

const moduleEnabled = ref(true)
const savingModuleConfig = ref(false)
const savingSettings = ref(false)
const feedback = ref('')
const errorMessage = ref('')
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

      <div class="grid">
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
}
</style>
