<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    item: {
      id: string;
      userId: string;
      userName: string;
      userProfilePicUrl: string;
      text: string;
      createdAt: any;
      updatedAt: any;
      isEdited: boolean;
    };
    isReply?: boolean;
    canReply?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    repliesCount?: number;
    showActions?: boolean;
    maxPreviewLength?: number;
  }>(),
  {
    isReply: false,
    canReply: false,
    canEdit: false,
    canDelete: false,
    repliesCount: 0,
    showActions: true,
    maxPreviewLength: 160
  }
);

const emit = defineEmits<{
  reply: [];
  edit: [];
  remove: [];
}>();

const expandedText = ref(false);

const normalizedText = computed(() => props.item.text || '');

const shouldTruncate = computed(
  () => normalizedText.value.length > Math.max(1, props.maxPreviewLength)
);

const visibleText = computed(() => {
  if (!shouldTruncate.value || expandedText.value) {
    return normalizedText.value;
  }

  return `${normalizedText.value.slice(0, props.maxPreviewLength).trimEnd()}...`;
});

const toggleExpandedText = () => {
  expandedText.value = !expandedText.value;
};

watch(
  () => props.item.id,
  () => {
    expandedText.value = false;
  }
);

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
</script>

<template>
  <article class="comment-item" :class="{ reply: props.isReply }">
    <header class="comment-head">
      <div class="user">
        <img v-if="item.userProfilePicUrl" :src="item.userProfilePicUrl" class="avatar" />
        <div v-else class="avatar placeholder">{{ item.userName?.charAt(0) || 'U' }}</div>
        <div class="meta">
          <strong>{{ item.userName || 'Usuario' }}</strong>
          <span>{{ formatDate(item.createdAt) }}</span>
        </div>
      </div>
      <span v-if="item.isEdited" class="edited">Editado</span>
    </header>

    <p class="text">{{ visibleText }}</p>

    <button
      v-if="shouldTruncate"
      class="read-more-btn"
      type="button"
      @click="toggleExpandedText"
    >
      {{ expandedText ? 'Ver menos' : 'Leer mas' }}
    </button>

    <footer v-if="showActions" class="actions">
      <button v-if="canReply" class="action-btn" type="button" @click="emit('reply')">
        Responder
      </button>
      <button v-if="canEdit" class="action-btn" type="button" @click="emit('edit')">
        Editar
      </button>
      <button v-if="canDelete" class="action-btn danger" type="button" @click="emit('remove')">
        Eliminar
      </button>
      <span v-if="!isReply && repliesCount > 0" class="count">
        {{ repliesCount }} respuestas
      </span>
    </footer>
  </article>
</template>

<style scoped>
.comment-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.75rem;
  background: var(--card-bg);
}

.comment-item.reply {
  background: var(--bg);
}

.comment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.user {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  object-fit: cover;
}

.avatar.placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--social-bg);
  color: var(--text-h);
  font-weight: 700;
}

.meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.meta strong {
  color: var(--text-h);
  font-size: 0.9rem;
}

.meta span {
  color: var(--text);
  font-size: 0.75rem;
}

.edited {
  color: var(--text);
  font-size: 0.72rem;
  font-weight: 600;
}

.text {
  margin: 0.6rem 0;
  color: var(--text-h);
  white-space: pre-wrap;
  line-height: 1.45;
}

.read-more-btn {
  border: 0;
  background: transparent;
  color: var(--accent);
  font-weight: 700;
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
  margin: -0.2rem 0 0.5rem;
}

.read-more-btn:hover {
  text-decoration: underline;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.action-btn {
  border: 0;
  background: transparent;
  color: var(--accent);
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.2rem 0.35rem;
  border-radius: 8px;
}

.action-btn:hover {
  background: var(--accent-bg);
}

.action-btn.danger {
  color: #b91c1c;
}

.count {
  margin-left: auto;
  font-size: 0.78rem;
  color: var(--text);
  font-weight: 600;
}
</style>
