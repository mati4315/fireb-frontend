<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/config/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useModuleStore } from '@/stores/moduleStore'
import { isStaffUser } from '@/utils/roles'

type RadioConfigForm = {
  enabled: boolean
  active: boolean
  title: string
  description: string
  audioUrl: string
  liveUrl: string
  ctaLabel: string
}

const authStore = useAuthStore()
const moduleStore = useModuleStore()

const loading = ref(true)
const saving = ref(false)
const feedback = ref('')
const errorMessage = ref('')
let unsubscribe: (() => void) | null = null

const form = reactive<RadioConfigForm>({
  enabled: true,
  active: false,
  title: 'Radio en vivo',
  description: 'Escucha la transmision en directo.',
  audioUrl: '',
  liveUrl: '',
  ctaLabel: 'Ir al link'
})

const isAuthorized = computed(() => {
  const rol = authStore.userProfile?.rol
  const email = authStore.user?.email || authStore.userProfile?.email
  const uid = authStore.user?.uid
  return authStore.isAuthenticated && isStaffUser(rol, email, uid, authStore.tokenClaims)
})

const resetStatus = () => {
  feedback.value = ''
  errorMessage.value = ''
}

const syncFormFromConfig = (raw: any) => {
  const radio = raw?.radio ?? {}
  form.enabled = radio.enabled ?? true
  form.active = radio.active ?? false
  form.title = typeof radio.title === 'string' && radio.title.trim()
    ? radio.title.trim()
    : 'Radio en vivo'
  form.description = typeof radio.description === 'string'
    ? radio.description.trim()
    : 'Escucha la transmision en directo.'
  form.audioUrl = typeof radio.audioUrl === 'string' ? radio.audioUrl.trim() : ''
  form.liveUrl = typeof radio.liveUrl === 'string' ? radio.liveUrl.trim() : ''
  form.ctaLabel = typeof radio.ctaLabel === 'string' && radio.ctaLabel.trim()
    ? radio.ctaLabel.trim()
    : 'Ir al link'
}

const loadConfig = () => {
  const configRef = doc(db, '_config', 'modules')
  unsubscribe?.()
  unsubscribe = onSnapshot(
    configRef,
    (snapshot) => {
      syncFormFromConfig(snapshot.data())
      loading.value = false
    },
    (error) => {
      loading.value = false
      errorMessage.value = `No se pudo cargar la configuracion de radio: ${error.message}`
    }
  )
}

const saveConfig = async () => {
  resetStatus()
  saving.value = true

  try {
    const payload = {
      radio: {
        enabled: Boolean(form.enabled),
        active: Boolean(form.active),
        title: form.title.trim() || 'Radio en vivo',
        description: form.description.trim(),
        audioUrl: form.audioUrl.trim(),
        liveUrl: form.liveUrl.trim(),
        ctaLabel: form.ctaLabel.trim() || 'Ir al link',
        updatedAt: serverTimestamp()
      }
    }

    await setDoc(doc(db, '_config', 'modules'), payload, { merge: true })
    await moduleStore.initModules(true)
    feedback.value = 'Configuracion de radio actualizada.'
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo guardar la configuracion.'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  moduleStore.initModulesListener()
  loadConfig()
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = null
})
</script>

<template>
  <section class="radio-page">
    <header class="header">
      <h1>Radio</h1>
      <p class="subtitle">Configura el reproductor fijo del sitio sin cargar peso extra.</p>
    </header>

    <section class="card">
      <div v-if="!isAuthorized" class="locked-state">
        <h2>Acceso restringido</h2>
        <p>Necesitas rol staff para administrar la radio.</p>
      </div>

      <template v-else>
        <div class="grid">
          <label class="field toggle">
            <input v-model="form.enabled" type="checkbox" />
            <span>
              <strong>Modulo habilitado</strong>
              <small>Si lo desactivas, la radio queda apagada en todo el sitio.</small>
            </span>
          </label>

          <label class="field toggle">
            <input v-model="form.active" type="checkbox" />
            <span>
              <strong>En vivo</strong>
              <small>Cuando esta activo, el dock aparece abajo y intenta reproducir automaticamente.</small>
            </span>
          </label>

          <label class="field full">
            <span>Titulo</span>
            <input v-model="form.title" type="text" maxlength="80" placeholder="Radio en vivo" />
          </label>

          <label class="field full">
            <span>Descripcion</span>
            <textarea
              v-model="form.description"
              rows="3"
              maxlength="180"
              placeholder="Escucha la transmision en directo."
            />
          </label>

          <label class="field full">
            <span>URL del audio</span>
            <input
              v-model="form.audioUrl"
              type="url"
              placeholder="https://.../stream.mp3"
            />
          </label>

          <label class="field full">
            <span>URL del vivo</span>
            <input
              v-model="form.liveUrl"
              type="url"
              placeholder="https://tu-sitio.com/vivo"
            />
          </label>

          <label class="field full">
            <span>Texto del boton</span>
            <input v-model="form.ctaLabel" type="text" maxlength="40" placeholder="Ir al link" />
          </label>
        </div>

        <div class="preview">
          <h3>Vista previa</h3>
          <p class="preview-title">{{ form.title || 'Radio en vivo' }}</p>
          <p class="preview-desc">{{ form.description || 'Escucha la transmision en directo.' }}</p>
          <div class="preview-links">
            <span class="badge" :class="{ on: form.active }">
              {{ form.active ? 'En vivo' : 'Inactiva' }}
            </span>
            <span class="badge" :class="{ on: form.enabled }">
              {{ form.enabled ? 'Habilitada' : 'Deshabilitada' }}
            </span>
          </div>
        </div>

        <div class="actions">
          <button class="save-btn" :disabled="saving || loading" @click="saveConfig">
            {{ saving ? 'Guardando...' : 'Guardar radio' }}
          </button>
        </div>

        <p v-if="feedback" class="ok-msg">{{ feedback }}</p>
        <p v-if="errorMessage" class="error-msg">{{ errorMessage }}</p>
      </template>
    </section>
  </section>
</template>

<style scoped>
.radio-page {
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
  display: grid;
  gap: 1rem;
}

.locked-state h2,
.preview h3 {
  margin: 0;
  font-size: 1.05rem;
}

.locked-state p {
  margin: 0.4rem 0 0;
  color: var(--text);
}

.grid {
  display: grid;
  gap: 0.85rem;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.field span,
.field strong {
  color: var(--text-h);
}

.field small {
  color: var(--text);
  line-height: 1.35;
}

.field input,
.field textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-h);
  padding: 0.7rem 0.8rem;
  font: inherit;
}

.field textarea {
  resize: vertical;
}

.toggle {
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: 0.7rem;
  padding: 0.8rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 4%, var(--card-bg));
}

.toggle input {
  margin-top: 0.2rem;
}

.full {
  grid-column: 1 / -1;
}

.preview {
  padding: 0.9rem;
  border-radius: 12px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--card-bg)), var(--card-bg));
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
}

.preview-title {
  margin: 0.4rem 0 0;
  font-weight: 700;
  color: var(--text-h);
}

.preview-desc {
  margin: 0.35rem 0 0;
  color: var(--text);
}

.preview-links {
  margin-top: 0.7rem;
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.badge {
  padding: 0.22rem 0.5rem;
  border-radius: 999px;
  background: var(--social-bg);
  color: var(--text-h);
  font-size: 0.76rem;
  font-weight: 700;
}

.badge.on {
  background: color-mix(in srgb, var(--accent) 14%, var(--social-bg));
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.save-btn {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  border-radius: 10px;
  padding: 0.58rem 1rem;
  font-weight: 700;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.ok-msg {
  margin: 0;
  color: #0c9b49;
}

.error-msg {
  margin: 0;
  color: #c53a3a;
}

@media (max-width: 760px) {
  .radio-page {
    padding: 1rem 0.75rem 1.5rem;
  }

  .actions {
    justify-content: stretch;
  }

  .save-btn {
    width: 100%;
  }
}
</style>
