<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  item: any
}>()

const emit = defineEmits<{
  (event: 'impression', item: any): void
  (event: 'click-ad', item: any): void
}>()

const root = ref<HTMLElement | null>(null)
const hasTrackedImpression = ref(false)
let observer: IntersectionObserver | null = null

const normalizedUrl = computed(() => {
  const rawUrl = (props.item?.ad?.destinationUrl || '').trim()
  if (!rawUrl) return ''
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl
  return `https://${rawUrl}`
})

const adTitle = computed(() => props.item?.ad?.title || 'Publicidad')
const adDescription = computed(() => props.item?.ad?.description || '')
const adImage = computed(() => props.item?.ad?.imageUrl || '')
const adCta = computed(() => props.item?.ad?.ctaLabel || 'Ver mas')

const handleVisible = () => {
  if (hasTrackedImpression.value) return
  hasTrackedImpression.value = true
  emit('impression', props.item)
}

const handleClick = () => {
  emit('click-ad', props.item)
  if (!normalizedUrl.value) return
  window.open(normalizedUrl.value, '_blank', 'noopener,noreferrer')
}

onMounted(() => {
  if (!root.value) return

  observer = new IntersectionObserver(
    (entries) => {
      const isVisible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6)
      if (isVisible) {
        handleVisible()
        if (observer && root.value) observer.unobserve(root.value)
      }
    },
    {
      threshold: [0.6]
    }
  )

  observer.observe(root.value)
})

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})
</script>

<template>
  <article ref="root" class="ad-card" role="complementary" aria-label="Publicidad">
    <header class="ad-header">
      <span class="ad-badge">Publicidad</span>
      <span class="ad-caption">Patrocinado</span>
    </header>

    <div class="ad-body">
      <img v-if="adImage" :src="adImage" :alt="adTitle" class="ad-image" loading="lazy" />

      <div class="ad-content">
        <h3>{{ adTitle }}</h3>
        <p v-if="adDescription">{{ adDescription }}</p>
      </div>
    </div>

    <footer class="ad-footer">
      <button class="ad-cta" :disabled="!normalizedUrl" @click="handleClick">
        {{ adCta }}
      </button>
    </footer>
  </article>
</template>

<style scoped>
.ad-card {
  background: linear-gradient(135deg, #fefaf1, #ffffff);
  border: 1px solid #f3dfb4;
  border-radius: 20px;
  padding: 1rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 6px 24px rgba(117, 84, 24, 0.08);
}

.ad-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.9rem;
}

.ad-badge {
  background: #1f2937;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  letter-spacing: 0.02em;
}

.ad-caption {
  color: #6b7280;
  font-size: 0.75rem;
  font-weight: 600;
}

.ad-body {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
}

.ad-image {
  width: 88px;
  height: 88px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid #efe5d1;
}

.ad-content h3 {
  margin: 0 0 0.35rem;
  color: #111827;
  font-size: 1rem;
}

.ad-content p {
  margin: 0;
  color: #4b5563;
  line-height: 1.5;
  font-size: 0.9rem;
}

.ad-footer {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}

.ad-cta {
  border: 0;
  border-radius: 10px;
  padding: 0.6rem 0.95rem;
  background: #0f766e;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.ad-cta:hover:not(:disabled) {
  transform: translateY(-1px);
}

.ad-cta:disabled {
  opacity: 0.55;
  cursor: default;
}

@media (max-width: 640px) {
  .ad-body {
    flex-direction: column;
  }

  .ad-image {
    width: 100%;
    height: 160px;
  }
}
</style>
