<script setup lang="ts">
withDefaults(defineProps<{
  eyebrow?: string;
  title: string;
  icon?: string;
  closeLabel?: string;
  actionLabel?: string;
  actionTo?: string;
}>(), {
  eyebrow: '',
  icon: '✦',
  closeLabel: 'Cerrar aviso',
  actionLabel: '',
  actionTo: ''
});

defineEmits<{
  close: [];
}>();
</script>

<template>
  <section class="dismissible-notice-card" :aria-label="title">
    <button class="notice-dismiss" type="button" :aria-label="closeLabel" @click="$emit('close')">×</button>
    <div class="notice-icon" aria-hidden="true">{{ icon }}</div>
    <div class="notice-copy">
      <p v-if="eyebrow" class="notice-eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }}</h2>
      <div class="notice-message"><slot /></div>
      <RouterLink v-if="actionLabel && actionTo" class="notice-action" :to="actionTo">
        {{ actionLabel }} <span aria-hidden="true">→</span>
      </RouterLink>
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.dismissible-notice-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  overflow: hidden;
  padding: 1.1rem;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  border-radius: 18px;
  background:
    radial-gradient(circle at 100% 0, color-mix(in srgb, var(--accent) 14%, transparent), transparent 15rem),
    var(--card-bg);
  color: var(--text);
}

.notice-icon {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 15px;
  background: color-mix(in srgb, var(--accent) 13%, var(--card-bg));
  color: var(--accent);
  font-size: 1.6rem;
  font-weight: 800;
}

.notice-copy {
  min-width: 0;
  padding-right: 1.7rem;
}

.notice-eyebrow {
  margin: 0 0 0.25rem;
  color: var(--accent);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.11em;
}

.notice-copy h2 {
  margin: 0;
  color: var(--text-h);
  font-size: 1.08rem;
}

.notice-message {
  margin-top: 0.35rem;
  line-height: 1.5;
}

.notice-message :deep(p) {
  margin: 0;
}

.notice-message :deep(strong) {
  color: var(--text-h);
}

.notice-dismiss {
  position: absolute;
  top: 0.65rem;
  right: 0.7rem;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}

.notice-dismiss:hover {
  background: color-mix(in srgb, var(--text) 14%, transparent);
}

.notice-action {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding: 0.5rem 0.8rem;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 0.84rem;
  font-weight: 750;
  text-decoration: none;
}

@media (max-width: 640px) {
  .dismissible-notice-card {
    grid-template-columns: 2.35rem minmax(0, 1fr);
    gap: 0.7rem;
    padding: 0.9rem;
    border-radius: 16px;
  }

  .notice-icon {
    width: 2.35rem;
    height: 2.35rem;
    border-radius: 12px;
    font-size: 1.25rem;
  }

  .notice-copy {
    padding-right: 1.25rem;
  }

  .notice-copy h2 {
    font-size: 0.98rem;
  }

  .notice-message {
    font-size: 0.86rem;
  }

  .notice-dismiss {
    top: 0.4rem;
    right: 0.4rem;
    width: 1.75rem;
    height: 1.75rem;
  }
}
</style>
