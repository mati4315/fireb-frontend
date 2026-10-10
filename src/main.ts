import { createApp } from 'vue'
import { App as CapApp } from '@capacitor/app'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/authStore'
import { initNativeRuntime } from '@/platform/nativeRuntime'

import './assets/main.css'

const STALE_CHUNK_RELOAD_KEY = 'cdelu_stale_chunk_reload_at'

// Si una pestaña quedó abierta durante un despliegue, puede pedir un chunk
// antiguo que ya fue reemplazado. Recarga una vez con una URL nueva para
// obtener el index.html y los hashes actuales, sin entrar en un bucle.
window.addEventListener('vite:preloadError', (event) => {
  const now = Date.now()
  let lastReloadAt = 0
  try {
    lastReloadAt = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) || 0)
  } catch {
    // El navegador puede tener el almacenamiento de sesión deshabilitado.
  }

  if (lastReloadAt && now - lastReloadAt < 30_000) {
    console.error('No se pudo cargar un recurso de esta versión. Recarga la página para continuar.', event)
    return
  }

  event.preventDefault()
  try {
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(now))
  } catch {
    // La recarga igualmente puede recuperar el último despliegue.
  }

  const refreshedUrl = new URL(window.location.href)
  refreshedUrl.searchParams.set('__refresh_assets', String(now))
  window.location.replace(refreshedUrl.toString())
})

// Quita el parámetro temporal usado al recuperar una versión vieja del sitio.
const currentUrl = new URL(window.location.href)
if (currentUrl.searchParams.has('__refresh_assets')) {
  currentUrl.searchParams.delete('__refresh_assets')
  window.history.replaceState(window.history.state, '', currentUrl.toString())
}

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
