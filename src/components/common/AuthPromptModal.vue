<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    message?: string;
  }>(),
  {
    title: 'Inicia sesion para continuar',
    message: 'Para continuar, inicia sesion con tu cuenta.'
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const authStore = useAuthStore();
const router = useRouter();

const providers = computed(() => authStore.socialProviders);

const getButtonLabel = (providerLabel: string) => `Continuar con ${providerLabel}`;

const getProviderClass = (providerId: string): string => {
  if (providerId === 'google.com') return 'provider-google';
  if (providerId === 'facebook.com') return 'provider-facebook';
  if (providerId === 'apple.com') return 'provider-apple';
  return 'provider-generic';
};

const loginWithProvider = async (providerId: string) => {
  const result = await authStore.loginWithProvider(providerId);
  if (result.success) {
    emit('close');
    router.push('/');
  }
};

const close = () => {
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="auth-prompt-backdrop" @click="close">
      <div class="auth-prompt-modal" @click.stop>
        <div class="auth-prompt-head">
          <div>
            <h3>{{ props.title }}</h3>
            <p>{{ props.message }}</p>
          </div>
          <button type="button" class="auth-close-btn" :disabled="authStore.loading" @click="close">
            x
          </button>
        </div>

        <div class="auth-provider-list">
          <button
            v-for="provider in providers"
            :key="provider.id"
            type="button"
            class="auth-provider-btn"
            :class="getProviderClass(provider.id)"
            :disabled="authStore.loading"
            @click="loginWithProvider(provider.id)"
          >
            <svg
              v-if="provider.id === 'google.com'"
              class="provider-icon google-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span v-else-if="provider.id === 'facebook.com'" class="provider-icon facebook-icon">f</span>
            <span v-else-if="provider.id === 'apple.com'" class="provider-icon apple-icon">A</span>
            <span v-else class="provider-icon generic-icon">{{ provider.label.charAt(0) }}</span>
            {{ getButtonLabel(provider.label) }}
          </button>
        </div>

        <div class="auth-prompt-actions">
          <button
            type="button"
            class="auth-prompt-secondary"
            :disabled="authStore.loading"
            @click="close"
          >
            Ahora no
          </button>
        </div>

        <p v-if="authStore.error" class="auth-prompt-error">{{ authStore.error }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.auth-prompt-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 1rem;
}

.auth-prompt-modal {
  width: min(440px, 100%);
  background: linear-gradient(180deg, var(--card-bg) 0%, var(--bg) 100%);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 1rem 1rem 0.95rem;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.22);
}

.auth-prompt-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.auth-prompt-modal h3 {
  margin: 0 0 0.35rem;
  color: var(--text-h);
  font-size: 1.04rem;
  letter-spacing: -0.2px;
}

.auth-prompt-modal p {
  margin: 0;
  color: var(--text);
  line-height: 1.5;
  font-size: 0.92rem;
}

.auth-close-btn {
  border: 1px solid var(--border);
  background: var(--social-bg);
  color: var(--text-h);
  border-radius: 9px;
  width: 30px;
  height: 30px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
}

.auth-provider-list {
  margin-top: 0.8rem;
  display: grid;
  gap: 0.45rem;
}

.auth-provider-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  border-radius: 10px;
  padding: 0.55rem 0.8rem;
  font-weight: 700;
  font-size: 0.88rem;
  border: 1px solid var(--border);
  background: var(--social-bg);
  color: var(--text-h);
  cursor: pointer;
}

.auth-provider-btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.auth-provider-btn.provider-google {
  background: #ffffff;
  color: #111827;
  border-color: #dadce0;
}

.auth-provider-btn.provider-facebook {
  background: #1877f2;
  color: #ffffff;
  border-color: #1877f2;
}

.auth-provider-btn.provider-apple {
  background: #111111;
  color: #ffffff;
  border-color: #111111;
}

.provider-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 0.95rem;
  font-weight: 800;
}

.google-icon {
  width: 18px;
  height: 18px;
}

.facebook-icon {
  font-family: Arial, sans-serif;
  font-size: 1rem;
}

.auth-prompt-actions {
  margin-top: 0.7rem;
  display: flex;
  justify-content: flex-end;
}

.auth-prompt-secondary {
  border-radius: 10px;
  padding: 0.45rem 0.8rem;
  font-weight: 700;
  font-size: 0.85rem;
  border: 1px solid var(--border);
  background: var(--social-bg);
  color: var(--text-h);
  cursor: pointer;
}

.auth-prompt-error {
  margin-top: 0.55rem;
  color: #b91c1c;
  font-size: 0.82rem;
  font-weight: 600;
}
</style>
