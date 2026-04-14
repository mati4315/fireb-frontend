<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  collectionGroup,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type QueryConstraint
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from '@/stores/authStore';
import { isAdminUser } from '@/utils/roles';

type ModerationType = 'comments' | 'replies';
type ModuleFilter = 'all' | 'news' | 'community';
type StatusFilter = 'active' | 'deleted';

type ModerationItem = {
  id: string;
  type: 'comment' | 'reply';
  path: string;
  contentId: string;
  commentId: string;
  module: 'news' | 'community';
  userId: string;
  userName: string;
  text: string;
  isEdited: boolean;
  deletedAt: any;
  createdAt: any;
  updatedAt: any;
};

const authStore = useAuthStore();

const isAuthorized = computed(() => {
  const rol = authStore.userProfile?.rol;
  const email = authStore.user?.email || authStore.userProfile?.email;
  const uid = authStore.user?.uid;
  return authStore.isAuthenticated && isAdminUser(rol, email, uid, authStore.tokenClaims);
});

const moduleEnabled = ref(true);
const moduleNewsEnabled = ref(true);
const moduleCommunityEnabled = ref(true);

const typeFilter = ref<ModerationType>('comments');
const moduleFilter = ref<ModuleFilter>('all');
const statusFilter = ref<StatusFilter>('active');

const moderationItems = ref<ModerationItem[]>([]);
const loadingItems = ref(false);
const savingConfig = ref(false);
const feedback = ref('');
const errorMessage = ref('');

const editingPath = ref<string | null>(null);
const editingText = ref('');

let unsubscribeConfig: (() => void) | null = null;
let unsubscribeModeration: (() => void) | null = null;

const resetFeedback = () => {
  feedback.value = '';
  errorMessage.value = '';
};

const formatDate = (value: any) => {
  if (!value) return '';
  const parsed = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
};

const filteredItems = computed(() => {
  let items = moderationItems.value;

  if (moduleFilter.value !== 'all') {
    items = items.filter((item) => item.module === moduleFilter.value);
  }

  if (statusFilter.value === 'active') {
    return items.filter((item) => !item.deletedAt);
  }
  return items.filter((item) => Boolean(item.deletedAt));
});

const loadConfig = () => {
  if (unsubscribeConfig) unsubscribeConfig();
  unsubscribeConfig = onSnapshot(
    doc(db, '_config', 'modules'),
    (snapshot) => {
      const commentsConfig = snapshot.data()?.comments || {};
      moduleEnabled.value = commentsConfig.enabled ?? true;
      moduleNewsEnabled.value = commentsConfig.newsEnabled ?? true;
      moduleCommunityEnabled.value = commentsConfig.communityEnabled ?? true;
    },
    (error) => {
      errorMessage.value = `No se pudo leer configuracion de comentarios: ${error.message}`;
    }
  );
};

const saveConfig = async () => {
  resetFeedback();
  savingConfig.value = true;
  try {
    await setDoc(
      doc(db, '_config', 'modules'),
      {
        comments: {
          enabled: Boolean(moduleEnabled.value),
          newsEnabled: Boolean(moduleNewsEnabled.value),
          communityEnabled: Boolean(moduleCommunityEnabled.value)
        }
      },
      { merge: true }
    );
    feedback.value = 'Configuracion de comentarios actualizada.';
  } catch (error: any) {
    errorMessage.value = `No se pudo guardar configuracion: ${error.message}`;
  } finally {
    savingConfig.value = false;
  }
};

const loadModerationItems = () => {
  if (unsubscribeModeration) {
    unsubscribeModeration();
    unsubscribeModeration = null;
  }

  loadingItems.value = true;
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(120)];

  const targetGroup = typeFilter.value === 'comments' ? 'comments' : 'replies';
  const moderationQuery = query(collectionGroup(db, targetGroup), ...constraints);

  unsubscribeModeration = onSnapshot(
    moderationQuery,
    (snapshot) => {
      moderationItems.value = snapshot.docs.map((itemDoc) => {
        const data = itemDoc.data() || {};
        return {
          id: itemDoc.id,
          type: targetGroup === 'comments' ? 'comment' : 'reply',
          path: itemDoc.ref.path,
          contentId: data.contentId || '',
          commentId: targetGroup === 'comments' ? itemDoc.id : data.commentId || '',
          module: data.module === 'news' ? 'news' : 'community',
          userId: data.userId || '',
          userName: data.userName || 'Usuario',
          text: data.text || '',
          isEdited: Boolean(data.isEdited),
          deletedAt: data.deletedAt || null,
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null
        } satisfies ModerationItem;
      });
      loadingItems.value = false;
    },
    (error) => {
      loadingItems.value = false;
      errorMessage.value = `No se pudo cargar comentarios: ${error.message}`;
    }
  );
};

const startEdit = (item: ModerationItem) => {
  editingPath.value = item.path;
  editingText.value = item.text || '';
};

const cancelEdit = () => {
  editingPath.value = null;
  editingText.value = '';
};

const saveEdit = async (item: ModerationItem) => {
  if (!editingPath.value) return;
  const text = editingText.value.trim();
  if (!text) return;

  resetFeedback();
  try {
    await updateDoc(doc(db, editingPath.value), {
      text,
      updatedAt: serverTimestamp(),
      isEdited: true
    });
    feedback.value = `${item.type === 'comment' ? 'Comentario' : 'Respuesta'} actualizada.`;
    cancelEdit();
  } catch (error: any) {
    errorMessage.value = `No se pudo editar: ${error.message}`;
  }
};

const softDelete = async (item: ModerationItem) => {
  const confirmed = window.confirm('Seguro que quieres eliminar este elemento?');
  if (!confirmed) return;

  resetFeedback();
  try {
    await updateDoc(doc(db, item.path), {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    feedback.value = `${item.type === 'comment' ? 'Comentario' : 'Respuesta'} eliminada.`;
  } catch (error: any) {
    errorMessage.value = `No se pudo eliminar: ${error.message}`;
  }
};

const restoreItem = async (item: ModerationItem) => {
  resetFeedback();
  try {
    await updateDoc(doc(db, item.path), {
      deletedAt: null,
      updatedAt: serverTimestamp()
    });
    feedback.value = `${item.type === 'comment' ? 'Comentario' : 'Respuesta'} restaurada.`;
  } catch (error: any) {
    errorMessage.value = `No se pudo restaurar: ${error.message}`;
  }
};

watch(
  () => [typeFilter.value, moduleFilter.value],
  () => {
    if (!isAuthorized.value) return;
    loadModerationItems();
  }
);

onMounted(() => {
  if (!isAuthorized.value) return;
  loadConfig();
  loadModerationItems();
});

onBeforeUnmount(() => {
  if (unsubscribeConfig) unsubscribeConfig();
  if (unsubscribeModeration) unsubscribeModeration();
});
</script>

<template>
  <section class="comments-manager-page">
    <header class="page-head">
      <h1>Gestion de Comentarios</h1>
      <p>Solo administradores pueden moderar globalmente comentarios y respuestas.</p>
    </header>

    <div v-if="!isAuthorized" class="restricted-card">
      <h2>No tienes acceso a este modulo</h2>
      <p>Necesitas rol admin para gestionar comentarios.</p>
      <RouterLink to="/" class="go-home">Volver al inicio</RouterLink>
    </div>

    <template v-else>
      <p v-if="feedback" class="msg ok">{{ feedback }}</p>
      <p v-if="errorMessage" class="msg error">{{ errorMessage }}</p>

      <article class="card">
        <h2>Configuracion del modulo</h2>
        <div class="switches">
          <label class="field inline">
            <input v-model="moduleEnabled" type="checkbox" />
            <span>Comentarios habilitados</span>
          </label>
          <label class="field inline">
            <input v-model="moduleNewsEnabled" type="checkbox" />
            <span>Comentarios en Noticias</span>
          </label>
          <label class="field inline">
            <input v-model="moduleCommunityEnabled" type="checkbox" />
            <span>Comentarios en Comunidad</span>
          </label>
        </div>

        <div class="actions">
          <button class="primary" :disabled="savingConfig" @click="saveConfig">
            {{ savingConfig ? 'Guardando...' : 'Guardar configuracion' }}
          </button>
        </div>
      </article>

      <article class="card">
        <h2>Moderacion global</h2>
        <div class="filters">
          <label class="field">
            <span>Tipo</span>
            <select v-model="typeFilter">
              <option value="comments">Comentarios</option>
              <option value="replies">Respuestas</option>
            </select>
          </label>
          <label class="field">
            <span>Modulo</span>
            <select v-model="moduleFilter">
              <option value="all">Todos</option>
              <option value="news">Noticias</option>
              <option value="community">Comunidad</option>
            </select>
          </label>
          <label class="field">
            <span>Estado</span>
            <select v-model="statusFilter">
              <option value="active">Activos</option>
              <option value="deleted">Eliminados</option>
            </select>
          </label>
        </div>

        <p v-if="loadingItems">Cargando elementos...</p>
        <p v-else-if="filteredItems.length === 0">No hay elementos para este filtro.</p>

        <div v-else class="items-list">
          <article v-for="item in filteredItems" :key="item.path" class="item-card">
            <header class="item-head">
              <strong>{{ item.type === 'comment' ? 'Comentario' : 'Respuesta' }}</strong>
              <span class="badge" :class="item.deletedAt ? 'deleted' : 'active'">
                {{ item.deletedAt ? 'Eliminado' : 'Activo' }}
              </span>
            </header>

            <div class="meta">
              <small>Usuario: {{ item.userName }} ({{ item.userId || 'sin uid' }})</small>
              <small>Modulo: {{ item.module }} | Content: {{ item.contentId || 'sin id' }}</small>
              <small>Creado: {{ formatDate(item.createdAt) }}</small>
            </div>

            <textarea
              v-if="editingPath === item.path"
              v-model="editingText"
              class="edit-input"
              rows="3"
              :maxlength="item.type === 'reply' ? 600 : 1000"
            />
            <p v-else class="text">{{ item.text }}</p>

            <footer class="actions">
              <template v-if="editingPath === item.path">
                <button class="primary" @click="saveEdit(item)">Guardar</button>
                <button class="ghost" @click="cancelEdit">Cancelar</button>
              </template>
              <template v-else>
                <button class="ghost" @click="startEdit(item)">Editar</button>
                <button
                  v-if="!item.deletedAt"
                  class="danger"
                  @click="softDelete(item)"
                >
                  Eliminar
                </button>
                <button
                  v-else
                  class="primary"
                  @click="restoreItem(item)"
                >
                  Restaurar
                </button>
              </template>
            </footer>
          </article>
        </div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.comments-manager-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2rem;
}

.page-head h1 {
  margin: 0;
  color: var(--text-h);
}

.page-head p {
  margin: 0.35rem 0 0;
  color: var(--text);
}

.restricted-card,
.card {
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 16px;
  padding: 1rem;
  margin-top: 1rem;
}

.go-home {
  display: inline-block;
  margin-top: 0.7rem;
  color: var(--accent);
  text-decoration: none;
  font-weight: 700;
}

.msg {
  margin-top: 0.8rem;
  padding: 0.7rem 0.9rem;
  border-radius: 10px;
  font-weight: 600;
}

.msg.ok {
  background: #e8f7ee;
  color: #166534;
}

.msg.error {
  background: #feeceb;
  color: #991b1b;
}

.switches {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.65rem;
}

.filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.9rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field.inline {
  flex-direction: row;
  align-items: center;
  gap: 0.45rem;
}

.field span {
  color: var(--text-h);
  font-weight: 600;
}

.field select {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
  border-radius: 10px;
  padding: 0.5rem 0.65rem;
  font: inherit;
}

.items-list {
  display: grid;
  gap: 0.75rem;
}

.item-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.8rem;
  background: var(--bg);
}

.item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.badge {
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 700;
}

.badge.active {
  background: #e8f7ee;
  color: #166534;
}

.badge.deleted {
  background: #feeceb;
  color: #991b1b;
}

.meta {
  margin: 0.45rem 0;
  display: grid;
  gap: 0.1rem;
}

.meta small {
  color: var(--text);
}

.text {
  margin: 0;
  color: var(--text-h);
  white-space: pre-wrap;
}

.edit-input {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--card-bg);
  color: var(--text-h);
  border-radius: 10px;
  padding: 0.55rem 0.65rem;
  font: inherit;
  resize: vertical;
}

.actions {
  margin-top: 0.65rem;
  display: flex;
  gap: 0.5rem;
}

button {
  border: 0;
  border-radius: 10px;
  padding: 0.52rem 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

button.primary {
  background: var(--accent);
  color: #fff;
}

button.ghost {
  border: 1px solid var(--border);
  background: var(--social-bg);
  color: var(--text-h);
}

button.danger {
  background: #991b1b;
  color: #fff;
}

button:disabled {
  opacity: 0.65;
  cursor: default;
}

@media (max-width: 900px) {
  .filters {
    grid-template-columns: 1fr;
  }
}
</style>
