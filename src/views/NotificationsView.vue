<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore, type NotificationRecord } from '@/stores/notificationStore';

const router = useRouter();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();

const savingFeedback = ref<string | null>(null);
const actionError = ref<string | null>(null);

const form = ref({
  notificationsEnabled: true,
  likes: true,
  comments: true,
  replies: true,
  follows: true
});

const syncFormFromStore = () => {
  const settings = notificationStore.settings;
  form.value = {
    notificationsEnabled: settings.notificationsEnabled,
    likes: settings.likes,
    comments: settings.comments,
    replies: settings.replies,
    follows: settings.follows
  };
};

watch(
  () => notificationStore.settings,
  () => {
    syncFormFromStore();
  },
  { deep: true, immediate: true }
);

const hasChanges = computed(() => {
  const settings = notificationStore.settings;
  return (
    form.value.notificationsEnabled !== settings.notificationsEnabled ||
    form.value.likes !== settings.likes ||
    form.value.comments !== settings.comments ||
    form.value.replies !== settings.replies ||
    form.value.follows !== settings.follows
  );
});

const canEditTypeSettings = computed(() => form.value.notificationsEnabled);
const pushPermissionLabel = computed(() => {
  if (notificationStore.browserPermission === 'unsupported') return 'No soportado';
  if (notificationStore.browserPermission === 'granted') return 'Permitido';
  if (notificationStore.browserPermission === 'denied') return 'Bloqueado';
  return 'Pendiente';
});

const initStore = async () => {
  actionError.value = null;
  if (!authStore.user?.uid) return;
  await notificationStore.init();
};

const savePreferences = async () => {
  savingFeedback.value = null;
  actionError.value = null;
  try {
    await notificationStore.updatePreferences({
      notificationsEnabled: form.value.notificationsEnabled,
      likes: form.value.likes,
      comments: form.value.comments,
      replies: form.value.replies,
      follows: form.value.follows
    });
    savingFeedback.value = 'Preferencias guardadas.';
  } catch (error: any) {
    actionError.value = error?.message || 'No se pudieron guardar las preferencias.';
  }
};

const activatePush = async () => {
  actionError.value = null;
  try {
    await notificationStore.enableWebPush();
    savingFeedback.value = 'Push web activado.';
  } catch (error: any) {
    actionError.value = error?.message || 'No se pudo activar push web.';
  }
};

const disablePush = async () => {
  actionError.value = null;
  try {
    await notificationStore.disableWebPush();
    savingFeedback.value = 'Push web desactivado para este navegador.';
  } catch (error: any) {
    actionError.value = error?.message || 'No se pudo desactivar push web.';
  }
};

const markAllAsRead = async () => {
  actionError.value = null;
  try {
    await notificationStore.markAllRead();
  } catch (error: any) {
    actionError.value = error?.message || 'No se pudo marcar todo como leido.';
  }
};

const openNotification = async (item: NotificationRecord) => {
  actionError.value = null;
  try {
    if (!item.isRead) {
      await notificationStore.markNotificationRead(item.id);
    }
    await router.push(item.targetPath || '/notificaciones');
  } catch (error: any) {
    actionError.value = error?.message || 'No se pudo abrir la notificacion.';
  }
};

const loadMore = async () => {
  actionError.value = null;
  try {
    await notificationStore.loadMore();
  } catch (error: any) {
    actionError.value = error?.message || 'No se pudieron cargar mas notificaciones.';
  }
};

watch(
  () => authStore.user?.uid || '',
  async (nextUid) => {
    if (!nextUid) {
      notificationStore.cleanup();
      return;
    }
    await initStore();
  },
  { immediate: true }
);

onMounted(async () => {
  await initStore();
});

</script>

<template>
  <section class="notifications-page">
    <header class="top-bar">
      <div>
        <h1>Notificaciones</h1>
        <p class="subtitle">Mantente al dia con likes, comentarios, respuestas y seguidores.</p>
      </div>
      <button
        class="mark-all-btn"
        :disabled="notificationStore.unreadCount === 0 || notificationStore.loading"
        @click="markAllAsRead"
      >
        Marcar todo leido
      </button>
    </header>

    <div class="summary-row">
      <div class="summary-card">
        <span class="label">No leidas</span>
        <strong>{{ notificationStore.unreadCount }}</strong>
      </div>
      <div class="summary-card">
        <span class="label">Permiso push</span>
        <strong>{{ pushPermissionLabel }}</strong>
      </div>
      <div class="summary-card">
        <span class="label">Estado</span>
        <strong>{{ notificationStore.settings.notificationsEnabled ? 'Activo' : 'Silenciado' }}</strong>
      </div>
    </div>

    <section class="settings-panel">
      <h2>Preferencias</h2>
      <label class="toggle-row">
        <input v-model="form.notificationsEnabled" type="checkbox">
        <span>Activar notificaciones</span>
      </label>
      <label class="toggle-row">
        <input v-model="form.likes" type="checkbox" :disabled="!canEditTypeSettings">
        <span>Me gusta</span>
      </label>
      <label class="toggle-row">
        <input v-model="form.comments" type="checkbox" :disabled="!canEditTypeSettings">
        <span>Comentarios</span>
      </label>
      <label class="toggle-row">
        <input v-model="form.replies" type="checkbox" :disabled="!canEditTypeSettings">
        <span>Respuestas</span>
      </label>
      <label class="toggle-row">
        <input v-model="form.follows" type="checkbox" :disabled="!canEditTypeSettings">
        <span>Nuevos seguidores</span>
      </label>

      <div class="settings-actions">
        <button
          class="primary-btn"
          :disabled="notificationStore.preferenceSaving || !hasChanges"
          @click="savePreferences"
        >
          {{ notificationStore.preferenceSaving ? 'Guardando...' : 'Guardar preferencias' }}
        </button>
      </div>
    </section>

    <section class="settings-panel">
      <h2>Push Web</h2>
      <p class="subtitle">Activa alertas del navegador para recibir avisos en tiempo real.</p>
      <div class="settings-actions">
        <button class="primary-btn" :disabled="notificationStore.pushLoading" @click="activatePush">
          {{ notificationStore.pushLoading ? 'Procesando...' : 'Activar push' }}
        </button>
        <button class="ghost-btn" :disabled="notificationStore.pushLoading" @click="disablePush">
          Desactivar push
        </button>
      </div>
      <p v-if="notificationStore.pushError" class="error-msg">{{ notificationStore.pushError }}</p>
    </section>

    <p v-if="savingFeedback" class="ok-msg">{{ savingFeedback }}</p>
    <p v-if="actionError" class="error-msg">{{ actionError }}</p>

    <section class="list-panel">
      <h2>Bandeja</h2>

      <p v-if="notificationStore.loading" class="state-msg">Cargando notificaciones...</p>
      <p v-else-if="notificationStore.items.length === 0" class="state-msg">
        Aun no tienes notificaciones.
      </p>

      <ul v-else class="notification-list">
        <li
          v-for="item in notificationStore.items"
          :key="item.id"
          class="notification-item"
          :class="{ unread: !item.isRead }"
        >
          <button class="notification-button" @click="openNotification(item)">
            <div class="avatar-wrap">
              <img
                v-if="item.actorProfilePictureUrl"
                :src="item.actorProfilePictureUrl"
                :alt="item.actorName"
                class="avatar"
              >
              <span v-else class="avatar-fallback">{{ item.actorName.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="content">
              <p class="message">{{ notificationStore.getMessage(item) }}</p>
              <p class="meta">{{ notificationStore.formatRelativeDate(item.lastEventAt) }}</p>
            </div>
            <span v-if="!item.isRead" class="dot" />
          </button>
        </li>
      </ul>

      <div class="load-more-wrap">
        <button
          v-if="notificationStore.canLoadMore"
          class="ghost-btn"
          :disabled="notificationStore.loadingMore"
          @click="loadMore"
        >
          {{ notificationStore.loadingMore ? 'Cargando...' : 'Cargar mas' }}
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.notifications-page {
  width: min(920px, 100%);
  margin: 0 auto;
  padding: 1.25rem 1rem 2rem;
  display: grid;
  gap: 1rem;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.top-bar h1 {
  margin: 0;
  font-size: clamp(1.4rem, 2.6vw, 2rem);
}

.subtitle {
  margin: 0.3rem 0 0;
  color: var(--text-m);
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.summary-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.75rem;
  display: grid;
  gap: 0.3rem;
}

.summary-card .label {
  font-size: 0.78rem;
  color: var(--text-m);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.settings-panel,
.list-panel {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
}

.settings-panel h2,
.list-panel h2 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.45rem;
}

.settings-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.8rem;
  flex-wrap: wrap;
}

.primary-btn,
.ghost-btn,
.mark-all-btn {
  border-radius: 10px;
  border: 1px solid var(--border);
  padding: 0.55rem 0.9rem;
  cursor: pointer;
  font-weight: 600;
}

.primary-btn {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.ghost-btn,
.mark-all-btn {
  background: transparent;
  color: var(--text-h);
}

.notification-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.notification-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}

.notification-item.unread {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
}

.notification-button {
  width: 100%;
  border: 0;
  background: transparent;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.7rem;
  align-items: center;
  text-align: left;
  cursor: pointer;
  padding: 0.7rem;
}

.avatar-wrap {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--muted-bg);
  display: grid;
  place-items: center;
}

.avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  font-weight: 700;
}

.message {
  margin: 0;
  font-size: 0.94rem;
}

.meta {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: var(--text-m);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
}

.state-msg {
  color: var(--text-m);
}

.ok-msg {
  margin: 0;
  color: #0c9b49;
}

.error-msg {
  margin: 0;
  color: #c53a3a;
}

.load-more-wrap {
  display: flex;
  justify-content: center;
  margin-top: 0.9rem;
}

@media (max-width: 760px) {
  .summary-row {
    grid-template-columns: 1fr;
  }

  .top-bar {
    flex-direction: column;
  }
}
</style>
