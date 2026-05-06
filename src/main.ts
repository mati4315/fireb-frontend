import { createApp } from 'vue'
import { App as CapApp } from '@capacitor/app'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/authStore'
import { initNativeRuntime } from '@/platform/nativeRuntime'

import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

app.mount('#app')

void initNativeRuntime(router).catch((err) => {
  console.error('Failed to initialize native runtime:', err)
})

window.addEventListener('native:push-open', (event) => {
  const customEvent = event as CustomEvent<{ targetPath?: string }>
  const targetPath = customEvent.detail?.targetPath || '/notificaciones'
  void router.push(targetPath).catch(() => undefined)
})

// Handle native app URL opens (deep links) and navigate to internal routes
// Example: https://cdelu.ar/c/some-slug -> route '/c/some-slug'
CapApp.addListener('appUrlOpen', (data) => {
  try {
    const url: string = data?.url || ''
    if (typeof url === 'string' && url.startsWith('https://cdelu.ar')) {
      const path = url.replace('https://cdelu.ar', '')
      const targetPath = path.startsWith('/') ? path : `/${path}`
      void router.push(targetPath).catch(() => undefined)
      console.debug('[AppUrlOpen] Navigated to', targetPath)
    }
  } catch (err) {
    console.error('AppUrlOpen handling failed', err)
  }
})

// Inicializa auth en segundo plano para no bloquear el primer render.
const authStore = useAuthStore()
authStore.initAuthListener().catch((err) => {
  console.error('Failed to initialize auth listener:', err)
})
