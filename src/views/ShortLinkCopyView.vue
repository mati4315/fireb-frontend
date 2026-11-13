<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/config/firebase'

type PublicShortLink = { url: string }

const targetUrl = ref('')
const loading = ref(true)
const copying = ref(false)
const errorMessage = ref('')
const feedbackMessage = ref('')
const urlField = ref<HTMLTextAreaElement | null>(null)

const getPublicTarget = httpsCallable<Record<string, never>, PublicShortLink>(functions, 'getShortLinkOnePublic')

const loadTarget = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await getPublicTarget({})
    targetUrl.value = result.data.url
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'No se pudo cargar la URL de destino.'
  } finally {
    loading.value = false
  }
}

const copyTarget = async () => {
  if (!targetUrl.value || copying.value) return
  copying.value = true
  errorMessage.value = ''
  feedbackMessage.value = ''

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(targetUrl.value)
    } else if (urlField.value) {
      urlField.value.focus()
      urlField.value.select()
      if (!document.execCommand('copy')) throw new Error('El navegador no permitió copiar la URL.')
    } else {
      throw new Error('No se pudo acceder al campo de la URL.')
    }
    feedbackMessage.value = 'URL copiada al portapapeles.'
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'No se pudo copiar. Selecciona la URL y cópiala manualmente.'
  } finally {
    copying.value = false
  }
}

onMounted(() => {
  void loadTarget()
})
</script>

<template>
  <main class="copy-short-link-page">
    <section class="copy-card" aria-labelledby="copy-title">
      <div class="copy-heading">
        <div>
          <p class="eyebrow">ENLACE CORTO /1</p>
          <h1 id="copy-title">Copiar URL de destino</h1>
          <p class="intro">Esta es la dirección a la que redirige actualmente <strong>cdelu.ar/1</strong>.</p>
        </div>
        <span class="link-badge">/2</span>
      </div>

      <div v-if="loading" class="status-message" role="status">Cargando URL actual…</div>

      <div v-else-if="targetUrl" class="copy-content">
        <label for="current-target">URL configurada</label>
        <textarea
          id="current-target"
          ref="urlField"
          :value="targetUrl"
          rows="5"
          readonly
          spellcheck="false"
          aria-describedby="copy-help"
        />
        <p id="copy-help" class="help-text">Puedes copiarla con el botón o seleccionar el texto manualmente.</p>
        <p v-if="feedbackMessage" class="feedback success" role="status">{{ feedbackMessage }}</p>
        <p v-if="errorMessage" class="feedback error" role="alert">{{ errorMessage }}</p>
        <button class="copy-button" type="button" :disabled="copying" @click="copyTarget">
          {{ copying ? 'Copiando…' : '⧉ Copiar URL' }}
        </button>
      </div>

      <div v-else class="copy-content">
        <p class="feedback error" role="alert">{{ errorMessage || 'Todavía no hay una URL configurada.' }}</p>
        <button class="retry-button" type="button" @click="loadTarget">Volver a intentar</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.copy-short-link-page {
  min-height: calc(100vh - 80px);
  padding: clamp(1rem, 4vw, 3rem) 1rem;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background:
    radial-gradient(circle at 12% 0%, var(--accent-bg), transparent 25rem),
    var(--bg);
}

.copy-card {
  width: min(100%, 760px);
  padding: clamp(1.2rem, 4vw, 2.25rem);
  background: var(--card-bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: 0 20px 55px rgba(15, 23, 42, 0.08);
}

.copy-heading {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1.5rem;
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

.copy-content {
  display: grid;
  gap: 0.65rem;
}

.copy-content label {
  color: var(--text-h);
  font-weight: 700;
}

.copy-content textarea {
  width: 100%;
  min-height: 130px;
  resize: vertical;
  padding: 0.85rem 0.95rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--input-bg);
  color: var(--text-h);
  font: 0.9rem/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow-wrap: anywhere;
}

.help-text {
  margin: 0;
  font-size: 0.85rem;
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

.copy-button,
.retry-button {
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

.copy-button:disabled {
  cursor: wait;
  opacity: 0.65;
}
</style>
