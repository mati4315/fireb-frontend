<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/config/firebase'

type ShortLinkConfig = {
  url: string
  updatedAt?: string | null
}

const targetUrl = ref('')
const updatedAt = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const getConfig = httpsCallable<Record<string, never>, ShortLinkConfig>(functions, 'getShortLinkOneConfig')
const saveConfig = httpsCallable<{ url: string }, { url: string }>(functions, 'setShortLinkOneConfig')

const updatedAtLabel = computed(() => {
  if (!updatedAt.value) return ''
  const date = new Date(updatedAt.value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
})

const loadConfig = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await getConfig({})
    targetUrl.value = result.data.url || ''
    updatedAt.value = result.data.updatedAt || null
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'No se pudo cargar la configuración del enlace.'
  } finally {
    loading.value = false
  }
}

const saveTarget = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  const candidate = targetUrl.value.trim()
  let normalizedUrl: string
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('Usa una URL HTTPS válida, sin usuario ni contraseña.')
    }
    normalizedUrl = parsed.toString()
  } catch (error) {
    errorMessage.value = error instanceof Error && error.message.startsWith('Usa una URL')
      ? error.message
      : 'Ingresa una URL HTTPS válida.'
    return
  }

  saving.value = true
  try {
    const result = await saveConfig({ url: normalizedUrl })
    targetUrl.value = result.data.url
    updatedAt.value = new Date().toISOString()
    successMessage.value = 'Destino guardado. /1 ya redirige a la nueva URL.'
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'No se pudo guardar el destino.'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadConfig()
})
</script>

<template>
  <main class="short-link-admin-page">
    <section class="short-link-card" aria-labelledby="short-link-title">
      <div class="short-link-heading">
        <div>
          <p class="eyebrow">PANEL DE ADMINISTRACIÓN</p>
          <h1 id="short-link-title">Destino del enlace /1</h1>
          <p class="intro">
            Pegá la dirección completa a la que querés enviar a quienes ingresen en
            <strong>cdelu.ar/1</strong>.
          </p>
        </div>
        <span class="link-badge">/1</span>
      </div>

      <div class="public-link-row">
        <span>Enlace corto</span>
        <a href="https://cdelu.ar/1" target="_blank" rel="noopener noreferrer">https://cdelu.ar/1 ↗</a>
      </div>
      <p class="copy-page-link">
        <a href="/2" target="_blank" rel="noopener noreferrer">Abrir /2 para copiar esta URL ↗</a>
      </p>

      <div v-if="loading" class="status-message" role="status">Cargando destino actual…</div>

      <form v-else class="target-form" @submit.prevent="saveTarget">
        <label for="short-link-target">URL de destino</label>
        <textarea
          id="short-link-target"
          v-model="targetUrl"
          name="targetUrl"
          rows="4"
          maxlength="2048"
          placeholder="https://ejemplo.com/archivo?token=..."
          autocomplete="url"
          spellcheck="false"
          required
        />
        <p class="help-text">Debe comenzar con https://. Se admiten URLs largas con parámetros o tokens de descarga.</p>

        <div v-if="updatedAtLabel" class="updated-at">Último cambio: {{ updatedAtLabel }}</div>

        <p v-if="errorMessage" class="feedback error" role="alert">{{ errorMessage }}</p>
        <p v-if="successMessage" class="feedback success" role="status">{{ successMessage }}</p>

        <button class="save-button" type="submit" :disabled="saving || !targetUrl.trim()">
          {{ saving ? 'Guardando…' : 'Guardar destino' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.short-link-admin-page {
  min-height: calc(100vh - 80px);
  padding: clamp(1rem, 4vw, 3rem) 1rem;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background:
    radial-gradient(circle at 12% 0%, var(--accent-bg), transparent 25rem),
    var(--bg);
}

.short-link-card {
  width: min(100%, 760px);
  padding: clamp(1.2rem, 4vw, 2.25rem);
  background: var(--card-bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: 0 20px 55px rgba(15, 23, 42, 0.08);
}

.short-link-heading {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

h1 {
  margin: 0;
  color: var(--text-h);
  font-size: clamp(1.55rem, 5vw, 2.1rem);
  line-height: 1.2;
}

.intro {
  margin: 0.8rem 0 0;
  max-width: 55ch;
}

.link-badge {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 14px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 1.15rem;
  font-weight: 800;
}

.public-link-row {
  margin: 1.5rem 0;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  background: var(--social-bg);
}

.public-link-row span,
.updated-at {
  color: var(--text);
  font-size: 0.88rem;
}

.public-link-row a {
  color: var(--accent);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.copy-page-link {
  margin: -0.8rem 0 1.5rem;
  color: var(--accent);
  font-weight: 700;
}

.target-form {
  display: grid;
  gap: 0.65rem;
}

.target-form label {
  color: var(--text-h);
  font-weight: 700;
}

.target-form textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  padding: 0.85rem 0.95rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--input-bg);
  color: var(--text-h);
  font: 0.95rem/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow-wrap: anywhere;
}

.target-form textarea:focus-visible {
  outline: 3px solid var(--accent-bg);
  border-color: var(--accent);
}

.help-text {
  margin: 0;
  font-size: 0.85rem;
}

.updated-at {
  margin-top: 0.3rem;
}

.feedback,
.status-message {
  margin: 0.25rem 0 0;
  padding: 0.75rem 0.9rem;
  border-radius: 10px;
  font-size: 0.92rem;
}

.success {
  background: rgba(22, 163, 74, 0.1);
  color: #15803d;
}

.error {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
}

.status-message {
  border: 1px solid var(--border);
  color: var(--text);
}

.save-button {
  justify-self: start;
  min-height: 46px;
  margin-top: 0.45rem;
  padding: 0.7rem 1.2rem;
  border: 0;
  border-radius: 11px;
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.save-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

@media (max-width: 520px) {
  .short-link-card {
    border-radius: 16px;
  }

  .public-link-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
