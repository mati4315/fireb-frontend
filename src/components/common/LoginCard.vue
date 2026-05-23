<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'

const props = withDefaults(
  defineProps<{
    flat?: boolean;
    hideHeader?: boolean;
  }>(),
  {
    flat: false,
    hideHeader: false
  }
)

const emit = defineEmits<{
  (e: 'success'): void;
}>()

const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const isLogin = ref(true)
const nombre = ref('')
const username = ref('')

const handleForm = async () => {
  let result;
  if (isLogin.value) {
    result = await authStore.login(email.value, password.value)
  } else {
    result = await authStore.signup(email.value, password.value, nombre.value, username.value)
  }

  if (result.success) {
    emit('success')
  }
}

const handleProviderLogin = async (providerId: string) => {
  const result = await authStore.loginWithProvider(providerId)
  if (result.success) {
    emit('success')
  }
}
</script>

<template>
  <div class="login-card" :class="{ 'is-flat': props.flat }">
    <header v-if="!props.hideHeader" class="card-header">
      <h1 class="title">{{ isLogin ? 'Bienvenido a CdeluAR' : 'Crea tu cuenta' }}</h1>
      <p class="subtitle">{{ isLogin ? 'Ingresa tus credenciales para continuar' : 'Únete a la comunidad de Concepción del Uruguay' }}</p>
    </header>

    <button
      v-for="provider in authStore.socialProviders"
      :key="provider.id"
      type="button"
      class="social-btn"
      :class="{
        'google-btn': provider.id === 'google.com',
        'facebook-btn': provider.id === 'facebook.com'
      }"
      :disabled="authStore.loading"
      @click="handleProviderLogin(provider.id)"
    >
      <svg v-if="provider.id === 'google.com'" class="google-icon" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      <span v-else class="google-icon" aria-hidden="true">f</span>
      {{ `Continuar con ${provider.label}` }}
    </button>

    <div class="divider">
      <span>o usa tu correo</span>
    </div>
    
    <form @submit.prevent="handleForm" class="login-form">
      <div v-if="!isLogin" class="form-group">
        <label>Nombre Completo</label>
        <input v-model="nombre" :disabled="authStore.loading" type="text" required placeholder="Ej: Juan Pérez" class="styled-input" />
      </div>

      <div v-if="!isLogin" class="form-group">
        <label>Nombre de Usuario</label>
        <input v-model="username" :disabled="authStore.loading" type="text" required placeholder="ej: juan_perez" class="styled-input" />
      </div>

      <div class="form-group">
        <label>Email</label>
        <input v-model="email" :disabled="authStore.loading" type="email" required placeholder="tu@correo.com" class="styled-input" />
      </div>

      <div class="form-group">
        <label>Contraseña</label>
        <input v-model="password" :disabled="authStore.loading" type="password" required placeholder="••••••••" class="styled-input" />
      </div>

      <button type="submit" :disabled="authStore.loading" class="submit-btn highlight">
        {{ authStore.loading ? 'Procesando...' : (isLogin ? 'Entrar Ahora' : 'Crear mi Cuenta') }}
      </button>

      <p v-if="authStore.error" class="error-msg">{{ authStore.error }}</p>

      <footer class="form-footer">
        <button type="button" :disabled="authStore.loading" @click="isLogin = !isLogin" class="toggle-btn">
          {{ isLogin ? '¿No tienes cuenta? Registrate aquí' : '¿Ya tienes cuenta? Inicia sesión' }}
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.login-card {
  width: 100%;
  max-width: 440px;
  background: var(--card-bg);
  padding: 2rem;
  border-radius: 24px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.08);
  border: 1px solid var(--border);
  animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

.login-card.is-flat {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  animation: none;
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.card-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.title {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-h);
  letter-spacing: -0.5px;
  margin: 0 0 0.4rem;
}

.subtitle {
  color: var(--text);
  font-size: 0.9rem;
  margin: 0;
  line-height: 1.4;
}

.social-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background-color: var(--input-bg);
  color: var(--text-h);
  border: 1px solid var(--border);
  padding: 0.8rem;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 0.5rem;
}

.social-btn:hover:not(:disabled) {
  background-color: var(--social-bg);
  transform: translateY(-1px);
}

.facebook-btn {
  background-color: #1877f2;
  border-color: #1877f2;
  color: #fff;
}

.facebook-btn:hover:not(:disabled) {
  background-color: #166fe5;
  border-color: #166fe5;
}

.google-icon {
  width: 20px;
  height: 20px;
}

.divider {
  display: flex;
  align-items: center;
  margin: 1.25rem 0;
  color: var(--text);
  font-size: 0.85rem;
}

.divider::before, .divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border);
}

.divider span {
  padding: 0 1rem;
}

.form-group {
  margin-bottom: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-h);
}

.styled-input {
  padding: 0.8rem 1rem;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 0.95rem;
  transition: all 0.2s;
  outline: none;
  color: var(--text-h);
}

.styled-input:focus {
  border-color: var(--accent);
  background: var(--card-bg);
  box-shadow: 0 0 0 4px var(--accent-bg);
}

.submit-btn {
  width: 100%;
  padding: 0.9rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 0.8rem;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px var(--accent-bg);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-msg {
  color: #ef4444;
  font-size: 0.85rem;
  text-align: center;
  margin-top: 1rem;
  background: #fee2e2;
  padding: 0.5rem;
  border-radius: 8px;
}

.form-footer {
  margin-top: 1.25rem;
  text-align: center;
}

.toggle-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.toggle-btn:hover {
  text-decoration: underline;
}

.styled-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--social-bg);
  border-color: var(--border);
}

.toggle-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  text-decoration: none;
}
</style>
