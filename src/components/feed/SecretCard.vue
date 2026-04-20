<template>
  <article
    :id="'secret-' + secret.id"
    class="secret-card"
  >
    <header 
      class="secret-card-header"
      :class="{
        'is-male': secret.sex === 'hombre',
        'is-female': secret.sex === 'mujer',
        'is-neutral': secret.sex === 'no_responder'
      }"
    >
      <div class="header-left">
        <svg v-if="secret.sex === 'hombre'" class="gender-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z"/>
        </svg>
        <svg v-else-if="secret.sex === 'mujer'" class="gender-icon" viewBox="0 -960 960 960" fill="currentColor">
          <path d="M400-80v-240H280l122-308q10-24 31-38t47-14q26 0 47 14t31 38l122 308H560v240H400Zm23.5-663.5Q400-767 400-800t23.5-56.5Q447-880 480-880t56.5 23.5Q560-833 560-800t-23.5 56.5Q513-720 480-720t-56.5-23.5Z"/>
        </svg>
        <svg v-else class="gender-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
        <span v-if="secret.age" class="header-age">{{ secret.age }} años</span>
      </div>

      <div class="header-center">
        <span class="header-id">@{{ secret.id.substring(0, 8) }}</span>
      </div>

      <div class="header-right">
        <span class="header-stat">{{ secret.stats.upVotesCount + secret.stats.downVotesCount }}</span>
        <div class="header-emojis">
          <span class="header-emoji">☹️</span>
          <span class="header-emoji">🙂</span>
        </div>
        <OptionsMenu
          v-if="isAuthorizedToManage"
          :options="secretMenuOptions"
          @action="handleSecretMenuAction"
        />
      </div>
    </header>

    <div class="secret-card-body">
      <div class="card-meta-top">
        <span class="alias">{{ secret.anonAlias || 'Anonimo' }}</span>
        <span class="dot">•</span>
        <span class="time">{{ formatRelativeTime(secret.createdAt) }}</span>
      </div>

      <p class="secret-text">{{ secret.descripcion }}</p>

      <div class="chips">
        <span v-if="secret.category" class="chip">{{ resolveCategoryLabel(secret.category) }}</span>
        <span v-if="secret.zone" class="chip">{{ secret.zone }}</span>
      </div>

      <footer 
        class="actions"
        :class="{
          'is-male': secret.sex === 'hombre',
          'is-female': secret.sex === 'mujer',
          'is-neutral': secret.sex === 'no_responder'
        }"
      >
        <button
          class="vote-btn"
          :class="{ active: secret.myVote === 1 }"
          type="button"
          :disabled="secretStore.isVotingPending(secret.id)"
          @click="handleVote(1)"
        >
          <svg class="btn-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d="M7 11c.889-.086 1.416-.543 2.156-1.057a22.323 22.323 0 0 0 3.958-5.084 1.6 1.6 0 0 1 .582-.628 1.549 1.549 0 0 1 1.466-.087c.205.095.388.233.537.406a1.64 1.64 0 0 1 .384 1.279l-1.388 4.114M7 11H4v6.5A1.5 1.5 0 0 0 5.5 19v0A1.5 1.5 0 0 0 7 17.5V11Zm6.5-1h4.915c.286 0 .372.014.626.15.254.135.472.332.637.572a1.874 1.874 0 0 1 .215 1.673l-2.098 6.4C17.538 19.52 17.368 20 16.12 20c-2.303 0-4.79-.943-6.67-1.475"/>
          </svg>
          <span>{{ secret.stats.upVotesCount }}</span>
        </button>
        <button
          class="vote-btn"
          :class="{ active: secret.myVote === -1 }"
          type="button"
          :disabled="secretStore.isVotingPending(secret.id)"
          @click="handleVote(-1)"
        >
          <svg class="btn-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d="M17 13c-.889.086-1.416.543-2.156 1.057a22.322 22.322 0 0 0-3.958 5.084 1.6 1.6 0 0 1-.582.628 1.549 1.549 0 0 1-1.466.087 1.587 1.587 0 0 1-.537-.406 1.666 1.666 0 0 1-.384-1.279l1.389-4.114M17 13h3V6.5A1.5 1.5 0 0 0 18.5 5v0A1.5 1.5 0 0 0 17 6.5V13Zm-6.5 1H5.585c-.286 0-.372-.014-.626-.15a1.797 1.797 0 0 1-.637-.572 1.873 1.873 0 0 1-.215-1.673l2.098-6.4C6.462 4.48 6.632 4 7.88 4c2.302 0 4.79.943 6.67 1.475"/>
          </svg>
          <span>{{ secret.stats.downVotesCount }}</span>
        </button>
        <button class="comment-btn" type="button" @click="toggleComments">
          Comentarios {{ secret.stats.commentsCount }}
        </button>
        <button class="open-btn" type="button" @click="openSecretDetail">
          Abrir
        </button>
        <button
          class="report-btn"
          type="button"
          :disabled="secretStore.isReportPending(secret.id) || secret.reportedByMe"
          @click="handleReport"
        >
          {{ secret.reportedByMe ? 'Reportado' : 'Reportar' }}
        </button>
      </footer>

      <p v-if="reportStatus" class="report-state">
        {{ reportStatus }}
      </p>
    </div>

    <section v-if="commentsOpen" class="comments-box">
      <div v-if="secretStore.isCommentsLoading(secret.id)" class="comment-state">
        Cargando comentarios...
      </div>
      <ul v-else class="comment-list">
        <li
          v-for="comment in secretStore.getComments(secret.id)"
          :key="comment.id"
          class="comment-item"
        >
          <p class="comment-meta">
            <strong>{{ comment.anonAlias || 'Anonimo' }}</strong>
            <span>| {{ formatRelativeTime(comment.createdAt) }}</span>
          </p>
          <p class="comment-text">{{ comment.text }}</p>
        </li>
        <li v-if="secretStore.getComments(secret.id).length === 0" class="comment-state">
          Sin comentarios todavia.
        </li>
      </ul>

      <div class="comment-form">
        <textarea
          v-model="commentDraft"
          placeholder="Escribe un comentario..."
          maxlength="1000"
          :disabled="secretStore.isCommentCreating(secret.id)"
        ></textarea>
        <p v-if="commentError" class="form-error">{{ commentError }}</p>
        <button
          type="button"
          :disabled="!commentDraft.trim() || secretStore.isCommentCreating(secret.id)"
          @click="handleCreateComment"
        >
          {{ secretStore.isCommentCreating(secret.id) ? 'Publicando...' : 'Comentar' }}
        </button>
      </div>
    </section>
  </article>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { 
  useSecretStore, 
  type SecretRecord, 
  type SecretCategory 
} from '@/stores/secretStore';
import { useAuthStore } from '@/stores/authStore';
import { isStaffUser } from '@/utils/roles';
import OptionsMenu, { type MenuOption } from '@/components/common/OptionsMenu.vue';

const props = defineProps<{
  secret: SecretRecord;
}>();

const router = useRouter();
const secretStore = useSecretStore();
const authStore = useAuthStore();

const commentsOpen = ref(false);
const commentDraft = ref('');
const commentError = ref<string | null>(null);
const reportStatus = ref<string | null>(null);

const isAuthorizedToManage = computed(() => {
  const rol = authStore.userProfile?.rol;
  const email = authStore.user?.email || authStore.userProfile?.email;
  const uid = authStore.user?.uid;
  return authStore.isAuthenticated && isStaffUser(rol, email, uid, authStore.tokenClaims);
});

const secretMenuOptions: MenuOption[] = [
  {
    id: 'delete',
    label: 'Borrar secreto',
    danger: true,
    requiresConfirm: true,
    confirmTitle: 'Borrar secreto',
    confirmMsg: '¿Estás seguro de que deseas borrar este secreto de forma permanente?',
    confirmButtonText: 'Sí, borrar'
  }
];

const handleSecretMenuAction = async (actionId: string) => {
  if (actionId === 'delete') {
    await secretStore.deleteSecret(props.secret.id);
  }
};

const toMillis = (value: any): number => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
};

const formatRelativeTime = (value: any): string => {
  const ms = toMillis(value);
  if (!ms) return 'hace un momento';
  const diff = Math.max(0, Date.now() - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(ms).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const slugify = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'secreto';
};

const openSecretDetail = () => {
  const slug = slugify(props.secret.descripcion.slice(0, 64));
  router.push(`/s/${encodeURIComponent(props.secret.id)}/${encodeURIComponent(slug)}#secret-${props.secret.id}`);
};

const resolveCategoryLabel = (value: SecretCategory): string => {
  const labels: Record<string, string> = {
    '': 'Sin categoria',
    'rumores': 'Rumores',
    'relaciones': 'Relaciones',
    'trabajo_negocios': 'Trabajo / negocios',
    'denuncia_light': 'Denuncias light',
    'random_divertido': 'Random / divertido'
  };
  return labels[value] || value;
};

const handleVote = async (vote: 1 | -1) => {
  try {
    await secretStore.voteSecret(props.secret.id, vote);
  } catch (err) {
    console.error('Error voting secret:', err);
  }
};

const handleReport = async () => {
  reportStatus.value = null;
  try {
    await secretStore.reportSecret(props.secret.id, 'contenido_inapropiado');
    reportStatus.value = 'Reporte enviado';
  } catch (err: any) {
    reportStatus.value = err?.message || 'No se pudo reportar';
  }
};

const toggleComments = async () => {
  commentsOpen.value = !commentsOpen.value;
  if (commentsOpen.value) {
    await secretStore.loadComments(props.secret.id);
  }
};

const handleCreateComment = async () => {
  const comment = commentDraft.value.trim();
  if (!comment) {
    commentError.value = 'Escribe un comentario.';
    return;
  }
  if (!/[0-9A-Za-z\u00C0-\u024F]/.test(comment)) {
    commentError.value = 'Escribe un comentario valido.';
    return;
  }

  commentError.value = null;
  try {
    await secretStore.createComment(props.secret.id, comment);
    commentDraft.value = '';
  } catch (err: any) {
    commentError.value = err?.message || 'No se pudo comentar.';
  }
};
</script>

<style scoped>
.secret-card {
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.secret-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.9rem;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  gap: 0.5rem;
}

.secret-card-header.is-male {
  background: #1e5fad;
}

.secret-card-header.is-female {
  background: #ca2a6e;
}

.secret-card-header.is-neutral {
  background: #6b728065;
}

.secret-card-header:not(.is-male):not(.is-female):not(.is-neutral) {
  background: var(--bg-hover);
  color: var(--text-h);
  border-bottom: 1px solid var(--border);
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.header-center {
  flex: 1;
  text-align: center;
}

.gender-icon {
  width: 1.15rem;
  height: 1.15rem;
}

.header-age {
  font-size: 0.95rem;
}

.header-id {
  opacity: 0.85;
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.header-stat {
  font-size: 0.88rem;
  margin-right: 0.2rem;
}

.header-emojis {
  display: flex;
  gap: 0.35rem;
  font-size: 1.1rem;
}

.secret-card-body {
  padding: 0.9rem;
  display: grid;
  gap: 0.6rem;
}

.card-meta-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: -0.1rem;
}

.alias {
  color: var(--text-h);
  font-weight: 700;
  font-size: 0.85rem;
}

.dot,
.time {
  color: var(--text);
  font-size: 0.78rem;
}

.secret-text {
  margin: 0;
  color: var(--text-h);
  line-height: 1.5;
  white-space: pre-wrap;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.22rem 0.5rem;
  font-size: 0.74rem;
  color: var(--text);
  background: var(--bg);
}

.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
  transition: all 0.4s ease;
}

.actions.is-male,
.actions.is-female,
.actions.is-neutral {
  margin: 1rem -0.9rem -0.9rem -0.9rem;
  padding: 0.8rem 0.9rem;
  border: none;
  border-top: 1px solid rgba(0,0,0,0.1);
  border-radius: 0 0 16px 16px;
}

.actions.is-male {
  background: #1e5fad;
  color: #fff;
}

.actions.is-female {
  background: #ca2a6e;
  color: #fff;
}

.actions.is-neutral {
  background: #6b728065;
  color: #fff;
}

.actions.is-male .vote-btn,
.actions.is-male .comment-btn,
.actions.is-male .open-btn,
.actions.is-male .report-btn,
.actions.is-female .vote-btn,
.actions.is-female .comment-btn,
.actions.is-female .open-btn,
.actions.is-female .report-btn,
.actions.is-neutral .vote-btn,
.actions.is-neutral .comment-btn,
.actions.is-neutral .open-btn,
.actions.is-neutral .report-btn {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.actions.is-male .vote-btn:hover,
.actions.is-male .comment-btn:hover,
.actions.is-male .open-btn:hover,
.actions.is-female .vote-btn:hover,
.actions.is-female .comment-btn:hover,
.actions.is-female .open-btn:hover,
.actions.is-neutral .vote-btn:hover,
.actions.is-neutral .comment-btn:hover,
.actions.is-neutral .open-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

.actions.is-male .vote-btn.active,
.actions.is-female .vote-btn.active,
.actions.is-neutral .vote-btn.active {
  background: #91c010;
  color: var(--text-h);
  border-color: #fff;
}

.vote-btn,
.comment-btn,
.open-btn,
.report-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  color: var(--text-h);
  font-weight: 700;
  font-size: 0.8rem;
  padding: 0.4rem 0.68rem;
  cursor: pointer;
}

.btn-icon {
  width: 1.1rem;
  height: 1.1rem;
}

.vote-btn.active {
  border-color: var(--accent-border);
  color: var(--accent);
}

.report-btn {
  margin-left: auto;
}

.report-state {
  margin: 0;
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 600;
}

.comments-box {
  border-top: 1px solid var(--border);
  padding: 0.65rem 0.9rem;
  display: grid;
  gap: 0.55rem;
}

.comment-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.5rem;
}

.comment-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  padding: 0.5rem 0.58rem;
}

.comment-meta {
  margin: 0;
  color: var(--text);
  font-size: 0.76rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.comment-text {
  margin: 0.35rem 0 0;
  color: var(--text-h);
  font-size: 0.86rem;
  white-space: pre-wrap;
}

.comment-form {
  display: grid;
  gap: 0.45rem;
}

.comment-form textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-h);
  padding: 0.55rem;
  min-height: 68px;
  resize: vertical;
  font: inherit;
}

.comment-form button {
  justify-self: end;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-weight: 800;
  padding: 0.48rem 0.85rem;
  cursor: pointer;
}

.comment-form button:disabled {
  opacity: 0.6;
  cursor: default;
}

.comment-state {
  color: var(--text);
  font-size: 0.84rem;
}

.form-error {
  margin: 0;
  color: #b93535;
  font-size: 1rem;
  font-weight: 700;
}

@media (max-width: 560px) {
  .report-btn {
    margin-left: 0;
  }
}
</style>
