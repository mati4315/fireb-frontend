<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface Props {
  text?: string;
  html?: string;
  isHtml?: boolean;
  maxPreviewLength?: number;
  collapsedLines?: number;
}

const props = withDefaults(defineProps<Props>(), {
  text: '',
  html: '',
  isHtml: false,
  maxPreviewLength: 280,
  collapsedLines: 6
});

const emit = defineEmits<{
  contentClick: [event: MouseEvent];
}>();

const expandedText = ref(false);

const normalizeSourceText = (value: string): string =>
  value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const plainSource = computed(() => {
  if (props.isHtml) return normalizeSourceText(props.html || '');
  return props.text || '';
});

const shouldTruncate = computed(
  () => plainSource.value.length > Math.max(1, props.maxPreviewLength)
);

const visibleText = computed(() => {
  if (props.isHtml) return '';
  if (!shouldTruncate.value || expandedText.value) return props.text || '';
  return `${(props.text || '').slice(0, props.maxPreviewLength).trimEnd()}...`;
});

const toggleExpandedText = () => {
  expandedText.value = !expandedText.value;
};

const emitContentClick = (event: MouseEvent) => {
  emit('contentClick', event);
};

watch(
  () => [props.text, props.html, props.isHtml],
  () => {
    expandedText.value = false;
  }
);
</script>

<template>
  <div class="expandable-text">
    <div
      v-if="isHtml"
      class="expandable-html"
      :class="{ collapsed: shouldTruncate && !expandedText }"
      :style="{ '--collapsed-lines': String(collapsedLines) }"
      v-html="html"
      @click="emitContentClick"
    ></div>

    <p v-else class="expandable-plain">{{ visibleText }}</p>

    <button
      v-if="shouldTruncate"
      class="read-more-btn"
      type="button"
      @click="toggleExpandedText"
    >
      {{ expandedText ? 'Ver menos' : 'Leer mas' }}
    </button>
  </div>
</template>

<style scoped>
.expandable-plain {
  margin: 0.5rem 0 0;
  white-space: pre-wrap;
  color: var(--text);
  line-height: 1.6;
}

.expandable-html {
  margin-top: 0.5rem;
  font-family: inherit;
  line-height: 1.6;
  color: var(--text);
}

.expandable-html.collapsed {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--collapsed-lines, 6);
  overflow: hidden;
}

.expandable-html :deep(p) {
  margin-bottom: 1rem;
}

.expandable-html :deep(a) {
  color: var(--accent);
  text-decoration: underline;
}

.expandable-html :deep(img) {
  max-width: 100%;
  border-radius: 12px;
  margin: 1rem 0;
  cursor: zoom-in;
}

.read-more-btn {
  border: 0;
  background: transparent;
  color: var(--accent);
  font-weight: 700;
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
  margin: 0.2rem 0 0;
}

.read-more-btn:hover {
  text-decoration: underline;
}
</style>
