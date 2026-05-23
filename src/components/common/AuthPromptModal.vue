<script setup lang="ts">
import { useAuthStore } from '@/stores/authStore';
import LoginCard from '@/components/common/LoginCard.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    message?: string;
  }>(),
  {
    title: 'Inicia sesión para continuar',
    message: 'Para continuar, ingresa con tu cuenta de CdeluAR.'
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const authStore = useAuthStore();

const close = () => {
  if (authStore.loading) return;
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="auth-prompt-backdrop" @click="close">
      <div class="auth-prompt-modal" @click.stop>
        <div class="auth-prompt-head">
          <div class="head-text">
            <h3>{{ props.title }}</h3>
            <p>{{ props.message }}</p>
          </div>
          <button type="button" class="auth-close-btn" :disabled="authStore.loading" @click="close">
            &times;
          </button>
        </div>

        <div class="auth-prompt-body">
          <LoginCard flat hideHeader @success="close" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.auth-prompt-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 1rem;
}

.auth-prompt-modal {
  width: min(440px, 100%);
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 24px;
  padding: 2rem;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  animation: modal-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

@keyframes modal-slide-in {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

.auth-prompt-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.head-text {
  flex: 1;
}

.auth-prompt-modal h3 {
  margin: 0 0 0.35rem;
  color: var(--text-h);
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.3px;
}

.auth-prompt-modal p {
  margin: 0;
  color: var(--text);
  line-height: 1.4;
  font-size: 0.9rem;
}

.auth-close-btn {
  border: 1px solid var(--border);
  background: var(--social-bg);
  color: var(--text-h);
  border-radius: 12px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.auth-close-btn:hover {
  background: var(--border);
}

.auth-prompt-body {
  margin-top: 0.5rem;
}
</style>
