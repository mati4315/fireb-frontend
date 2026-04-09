<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

export interface MenuOption {
  id: string;
  label: string;
  danger?: boolean;
  requiresConfirm?: boolean;
  confirmTitle?: string;
  confirmMsg?: string;
  confirmButtonText?: string;
}

const props = defineProps<{
  options: MenuOption[];
}>();

const emit = defineEmits<{
  action: [id: string];
}>();

const isOpen = ref(false);
const showConfirmModal = ref(false);
const pendingAction = ref<MenuOption | null>(null);

const menuRef = ref<HTMLElement | null>(null);

const toggleMenu = () => {
  isOpen.value = !isOpen.value;
};

const handleOptionClick = (option: MenuOption) => {
  isOpen.value = false;
  if (option.requiresConfirm) {
    pendingAction.value = option;
    showConfirmModal.value = true;
  } else {
    emit('action', option.id);
  }
};

const confirmAction = () => {
  if (pendingAction.value) {
    emit('action', pendingAction.value.id);
  }
  closeConfirmModal();
};

const closeConfirmModal = () => {
  showConfirmModal.value = false;
  pendingAction.value = null;
};

const closeMenuOnOutsideClick = (e: MouseEvent) => {
  if (isOpen.value && menuRef.value && !menuRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', closeMenuOnOutsideClick);
});

onUnmounted(() => {
  document.removeEventListener('click', closeMenuOnOutsideClick);
});
</script>

<template>
  <div class="options-menu-container" ref="menuRef">
    <button class="menu-trigger" @click.stop="toggleMenu" aria-label="Opciones">
      <!-- Dots Icon -->
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="5" r="1.5"></circle>
        <circle cx="12" cy="12" r="1.5"></circle>
        <circle cx="12" cy="19" r="1.5"></circle>
      </svg>
    </button>

    <div v-if="isOpen" class="dropdown-menu">
      <button
        v-for="option in props.options"
        :key="option.id"
        class="dropdown-item"
        :class="{ danger: option.danger }"
        @click.stop="handleOptionClick(option)"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- Teleport or inline Modal for confirmation -->
    <Teleport to="body">
      <div v-if="showConfirmModal" class="modal-overlay" @click.self="closeConfirmModal">
        <div class="modal-content">
          <h3>{{ pendingAction?.confirmTitle || 'Confirmar Acción' }}</h3>
          <p>{{ pendingAction?.confirmMsg || '¿Estás seguro de que deseas realizar esta acción?' }}</p>
          <div class="modal-actions">
            <button class="cancel-btn" @click="closeConfirmModal">Cancelar</button>
            <button class="confirm-btn" :class="{ danger: pendingAction?.danger }" @click="confirmAction">
              {{ pendingAction?.confirmButtonText || 'Confirmar' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.options-menu-container {
  position: relative;
  display: inline-block;
}

.menu-trigger {
  background: transparent;
  border: none;
  color: var(--text);
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s, color 0.2s;
  /* Mobile touch area adjustment */
  min-width: 40px;
  min-height: 40px;
}

.menu-trigger:hover,
.menu-trigger:active {
  background: var(--social-bg);
  color: var(--text-h);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  min-width: 140px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  padding: 4px 0;
  animation: fadeIn 0.15s ease-out;
}

.dropdown-item {
  background: transparent;
  border: none;
  padding: 10px 16px;
  text-align: left;
  font-size: 0.9rem;
  color: var(--text-h);
  cursor: pointer;
  transition: background-color 0.2s;
  width: 100%;
}

.dropdown-item:hover,
.dropdown-item:active {
  background: var(--social-bg);
}

.dropdown-item.danger {
  color: #d93025;
}

/* Modal styles based on other modals typically found in the app */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-content {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 1.5rem;
  max-width: 320px;
  width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  text-align: center;
  animation: scaleIn 0.2s ease-out;
}

.modal-content h3 {
  margin: 0 0 0.75rem 0;
  color: var(--text-h);
  font-size: 1.2rem;
}

.modal-content p {
  color: var(--text);
  font-size: 0.95rem;
  margin: 0 0 1.5rem 0;
  line-height: 1.4;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.modal-actions button {
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  flex: 1;
}

.cancel-btn {
  background: var(--social-bg);
  color: var(--text-h);
}

.confirm-btn {
  background: var(--accent);
  color: white;
}

.confirm-btn.danger {
  background: #d93025;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>
