import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/authStore'

import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

app.mount('#app')

// Inicializa auth en segundo plano para no bloquear el primer render.
const authStore = useAuthStore()
authStore.initAuthListener().catch((err) => {
  console.error('Failed to initialize auth listener:', err)
})
