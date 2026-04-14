<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface Props {
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  compact?: boolean;
  loading?: boolean;
  showCancel?: boolean;
  maxLength?: number;
}

const props = withDefaults(defineProps<Props>(), {
  initialValue: '',
  placeholder: 'Escribe un comentario...',
  submitLabel: 'Enviar',
  compact: false,
  loading: false,
  showCancel: true,
  maxLength: 1000
});

const emit = defineEmits<{
  submit: [value: string];
  cancel: [];
}>();

const text = ref(props.initialValue);

watch(
  () => props.initialValue,
  (value) => {
    text.value = value || '';
  }
);

const trimmedText = computed(() => text.value.trim());

const handleSubmit = () => {
  if (!trimmedText.value || props.loading) return;
  emit('submit', trimmedText.value);
  if (!props.initialValue) {
    text.value = '';
  }
};

const handleCancel = () => {
  text.value = props.initialValue || '';
  emit('cancel');
};
</script>

<template>
  <form class="comment-form" :class="{ compact }" @submit.prevent="handleSubmit">
    <textarea
      v-model="text"
      class="comment-input"
      :placeholder="placeholder"
      :rows="compact ? 2 : 3"
      :maxlength="maxLength"
    />

    <div class="form-actions">
      <button type="submit" class="btn primary" :disabled="!trimmedText || loading">
        {{ loading ? 'Guardando...' : submitLabel }}
      </button>
      <button
        v-if="showCancel"
        type="button"
        class="btn ghost"
        @click="handleCancel"
      >
        Cancelar
      </button>
    </div>
  </form>
</template>

<style scoped>
.comment-form {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.comment-form.compact .comment-input {
  min-height: 60px;
}

.comment-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  background: var(--bg);
  color: var(--text-h);
  font: inherit;
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: 0.45rem;
}

.btn {
  border: 0;
  border-radius: 10px;
  padding: 0.5rem 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.btn.primary {
  background: var(--accent);
  color: #fff;
}

.btn.ghost {
  border: 1px solid var(--border);
  background: var(--social-bg);
  color: var(--text-h);
}

.btn:disabled {
  opacity: 0.65;
  cursor: default;
}
</style>
