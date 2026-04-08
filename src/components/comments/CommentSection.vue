<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import CommentForm from './CommentForm.vue';
import CommentItem from './CommentItem.vue';
import { useCommentStore, type ContentModule } from '@/stores/commentStore';
import { useAuthStore } from '@/stores/authStore';
import { isAdminUser } from '@/utils/roles';

const props = defineProps<{
  contentId: string;
  module: ContentModule;
}>();

const commentStore = useCommentStore();
const authStore = useAuthStore();

const creatingComment = ref(false);
const editingCommentId = ref<string | null>(null);
const replyingToCommentId = ref<string | null>(null);
const editingReplyKey = ref<string | null>(null);

const commentsEnabled = computed(() =>
  commentStore.isCommentsEnabledForModule(props.module)
);

const isAuthenticated = computed(() => authStore.isAuthenticated);

const currentUserId = computed(() => authStore.user?.uid || '');

const isAdmin = computed(() => {
  const rol = authStore.userProfile?.rol;
  const email = authStore.user?.email || authStore.userProfile?.email;
  const uid = authStore.user?.uid;
  return authStore.isAuthenticated && isAdminUser(rol, email, uid, authStore.tokenClaims);
});

const comments = computed(() => commentStore.getComments(props.contentId));
const commentsLoading = computed(() => commentStore.isCommentsLoading(props.contentId));
const hasMoreComments = computed(() => commentStore.hasMoreComments(props.contentId));

const canManageItem = (userId: string) => {
  return isAdmin.value || currentUserId.value === userId;
};

const getReplyKey = (commentId: string, replyId: string) => `${commentId}::${replyId}`;

const getReplies = (commentId: string) => commentStore.getReplies(props.contentId, commentId);
const isRepliesLoading = (commentId: string) =>
  commentStore.isRepliesLoading(props.contentId, commentId);
const hasMoreReplies = (commentId: string) =>
  commentStore.hasMoreReplies(props.contentId, commentId);

const ensureRepliesLoaded = async (commentId: string) => {
  const replies = getReplies(commentId);
  if (replies.length > 0) return;
  await commentStore.loadReplies(props.contentId, commentId, { reset: true, pageSize: 6 });
};

const loadMoreReplies = async (commentId: string) => {
  await commentStore.loadReplies(props.contentId, commentId, { pageSize: 6 });
};

const loadMoreComments = async () => {
  await commentStore.loadComments(props.contentId, { pageSize: 6 });
};

const createComment = async (text: string) => {
  creatingComment.value = true;
  try {
    await commentStore.createComment(props.contentId, props.module, text);
  } catch (error) {
    console.error('Error creating comment:', error);
  } finally {
    creatingComment.value = false;
  }
};

const createReply = async (commentId: string, text: string) => {
  try {
    await commentStore.createReply(props.contentId, commentId, props.module, text);
    replyingToCommentId.value = null;
  } catch (error) {
    console.error('Error creating reply:', error);
  }
};

const saveCommentEdit = async (commentId: string, text: string) => {
  try {
    await commentStore.editComment(props.contentId, commentId, text);
    editingCommentId.value = null;
  } catch (error) {
    console.error('Error editing comment:', error);
  }
};

const removeComment = async (commentId: string) => {
  const confirmed = window.confirm('Seguro que quieres eliminar este comentario?');
  if (!confirmed) return;

  try {
    await commentStore.softDeleteComment(props.contentId, commentId);
  } catch (error) {
    console.error('Error deleting comment:', error);
  }
};

const saveReplyEdit = async (commentId: string, replyId: string, text: string) => {
  try {
    await commentStore.editReply(props.contentId, commentId, replyId, text);
    editingReplyKey.value = null;
  } catch (error) {
    console.error('Error editing reply:', error);
  }
};

const removeReply = async (commentId: string, replyId: string) => {
  const confirmed = window.confirm('Seguro que quieres eliminar esta respuesta?');
  if (!confirmed) return;

  try {
    await commentStore.softDeleteReply(props.contentId, commentId, replyId);
  } catch (error) {
    console.error('Error deleting reply:', error);
  }
};

watch(
  commentsEnabled,
  async (enabled) => {
    if (!enabled) {
      commentStore.closeThread(props.contentId);
      return;
    }
    await commentStore.openThread(props.contentId, props.module);
  },
  { immediate: true }
);

watch(
  comments,
  (items) => {
    for (const comment of items) {
      if ((comment.stats?.repliesCount || 0) > 0) {
        void ensureRepliesLoaded(comment.id);
      }
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  commentStore.closeThread(props.contentId);
});
</script>

<template>
  <section class="comment-section">
    <h4 class="section-title">Comentarios</h4>

    <div v-if="!commentsEnabled" class="disabled-box">
      <p>Los comentarios estan deshabilitados para esta seccion.</p>
    </div>

    <template v-else>
      <div v-if="isAuthenticated" class="composer">
        <CommentForm
          placeholder="Escribe tu comentario"
          submit-label="Comentar"
          :loading="creatingComment"
          :show-cancel="false"
          @submit="createComment"
        />
      </div>
      <div v-else class="guest-box">
        <p>Inicia sesion para comentar y responder.</p>
        <RouterLink to="/login" class="login-link">Iniciar sesion</RouterLink>
      </div>

      <p v-if="commentsLoading && comments.length === 0" class="state-msg">
        Cargando comentarios...
      </p>
      <p v-else-if="comments.length === 0" class="state-msg">
        Aun no hay comentarios.
      </p>

      <div v-else class="comment-list">
        <article v-for="comment in comments" :key="comment.id" class="comment-thread">
          <CommentForm
            v-if="editingCommentId === comment.id"
            :initial-value="comment.text"
            submit-label="Guardar"
            compact
            @submit="saveCommentEdit(comment.id, $event)"
            @cancel="editingCommentId = null"
          />
          <CommentItem
            v-else
            :item="comment"
            :replies-count="comment.stats?.repliesCount || 0"
            :can-reply="isAuthenticated"
            :can-edit="canManageItem(comment.userId)"
            :can-delete="canManageItem(comment.userId)"
            @reply="replyingToCommentId = replyingToCommentId === comment.id ? null : comment.id"
            @edit="editingCommentId = comment.id"
            @remove="removeComment(comment.id)"
          />

            <CommentForm
              v-if="replyingToCommentId === comment.id"
              placeholder="Escribe una respuesta"
              submit-label="Responder"
              :max-length="300"
              compact
              @submit="createReply(comment.id, $event)"
              @cancel="replyingToCommentId = null"
            />

          <div
            v-if="(comment.stats?.repliesCount || 0) > 0 || getReplies(comment.id).length > 0"
            class="replies-box"
          >
            <p
              v-if="isRepliesLoading(comment.id) && getReplies(comment.id).length === 0"
              class="state-msg"
            >
              Cargando respuestas...
            </p>

            <div v-else class="replies-list">
              <article
                v-for="reply in getReplies(comment.id)"
                :key="reply.id"
                class="reply-item"
              >
                  <CommentForm
                    v-if="editingReplyKey === getReplyKey(comment.id, reply.id)"
                    :initial-value="reply.text"
                    submit-label="Guardar"
                    :max-length="300"
                    compact
                    @submit="saveReplyEdit(comment.id, reply.id, $event)"
                    @cancel="editingReplyKey = null"
                  />
                <CommentItem
                  v-else
                  :item="reply"
                  :is-reply="true"
                  :can-edit="canManageItem(reply.userId)"
                  :can-delete="canManageItem(reply.userId)"
                  @edit="editingReplyKey = getReplyKey(comment.id, reply.id)"
                  @remove="removeReply(comment.id, reply.id)"
                />
              </article>
            </div>

            <button
              v-if="hasMoreReplies(comment.id)"
              class="load-more-btn"
              type="button"
              @click="loadMoreReplies(comment.id)"
            >
              Cargar mas respuestas
            </button>
          </div>
        </article>
      </div>

      <button
        v-if="hasMoreComments"
        class="load-more-btn"
        type="button"
        @click="loadMoreComments"
      >
        Cargar mas comentarios
      </button>
    </template>
  </section>
</template>

<style scoped>
.comment-section {
  margin-top: 1rem;
  border-top: 1px solid var(--border);
  padding-top: 0.9rem;
}

.section-title {
  margin: 0 0 0.7rem;
  color: var(--text-h);
  font-size: 0.95rem;
}

.composer,
.guest-box,
.disabled-box {
  margin-bottom: 0.75rem;
}

.guest-box,
.disabled-box {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.7rem;
  background: var(--bg);
}

.guest-box p,
.disabled-box p {
  margin: 0;
  color: var(--text);
}

.login-link {
  display: inline-block;
  margin-top: 0.35rem;
  color: var(--accent);
  font-weight: 700;
  text-decoration: none;
}

.state-msg {
  margin: 0.3rem 0;
  color: var(--text);
  font-size: 0.84rem;
}

.comment-list {
  display: grid;
  gap: 0.7rem;
}

.comment-thread {
  display: grid;
  gap: 0.5rem;
}

.load-more-btn {
  border: 1px solid var(--border);
  background: var(--social-bg);
  color: var(--text-h);
  border-radius: 10px;
  padding: 0.45rem 0.7rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  width: fit-content;
}

.replies-box {
  margin-left: 1rem;
  border-left: 2px solid var(--border);
  padding-left: 0.7rem;
}

.replies-list {
  display: grid;
  gap: 0.55rem;
}

@media (max-width: 768px) {
  .replies-box {
    margin-left: 0.5rem;
    padding-left: 0.5rem;
  }
}
</style>
