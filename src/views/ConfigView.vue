<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useModuleStore } from '@/stores/moduleStore'

type DefaultFeedTab = 'todo' | 'news' | 'post' | 'surveys' | 'lottery'

const authStore = useAuthStore()
const moduleStore = useModuleStore()

const saving = ref(false)
const successMsg = ref('')
const errorMsg = ref('')
const selectedTab = ref<DefaultFeedTab>('todo')

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

const hasChanges = computed(() => selectedTab.value !== currentSavedTab.value)

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
    await authStore.updateDefaultFeedTabPreference(selectedTab.value)
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

.card h2 {
  margin: 0;
  font-size: 1.05rem;
}

.hint {
  margin: 0.4rem 0 0.9rem;
  color: var(--text);
  font-size: 0.92rem;
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
}
</style>
