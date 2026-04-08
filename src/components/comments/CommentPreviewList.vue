<script setup lang="ts">
import { computed, watch } from 'vue';
import CommentItem from './CommentItem.vue';
import { useCommentStore, type ContentModule } from '@/stores/commentStore';

const props = withDefaults(
  defineProps<{
    contentId: string;
    module: ContentModule;
    limit?: number;
  }>(),
  {
    limit: 2
  }
);

const commentStore = useCommentStore();

const previewItems = computed(() =>
  commentStore.getPreviewComments(props.contentId).slice(0, props.limit)
);

const isLoading = computed(() => commentStore.isPreviewCommentsLoading(props.contentId));

const refreshPreview = async () => {
  if (!commentStore.isCommentsEnabledForModule(props.module)) return;
  await commentStore.loadPreviewComments(props.contentId, props.limit);
};

watch(
  () => [props.contentId, props.module, props.limit],
  () => {
    void refreshPreview();
  },
  { immediate: true }
);
</script>

<template>
  <section v-if="previewItems.length > 0 || isLoading" class="comment-preview">
    <p class="preview-title">Comentarios recientes</p>

    <p v-if="isLoading && previewItems.length === 0" class="preview-loading">
      Cargando comentarios...
    </p>

    <div v-else class="preview-list">
      <CommentItem
        v-for="comment in previewItems"
        :key="comment.id"
        :item="comment"
        :show-actions="false"
      />
    </div>
  </section>
</template>

<style scoped>
.comment-preview {
  margin-top: 0.9rem;
  display: grid;
  gap: 0.55rem;
}

.preview-title {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text);
  font-weight: 700;
}

.preview-loading {
  margin: 0;
  color: var(--text);
  font-size: 0.82rem;
}

.preview-list {
  display: grid;
  gap: 0.55rem;
}
</style>
