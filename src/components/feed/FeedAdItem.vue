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
      <div class="ad-badges">
        <span class="ad-badge">Publicidad</span>
        <span class="ad-caption">Patrocinado</span>
      </div>
      <span class="ad-signal">Impulsa tu marca</span>
    </header>

    <div class="ad-body">
      <img v-if="adImage" :src="adImage" :alt="adTitle" class="ad-image" loading="lazy" />

      <div class="ad-content">
        <h3>
          <a
            v-if="normalizedUrl"
            :href="normalizedUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="ad-title-link"
            @click="handleClick"
          >
            {{ adTitle }}
          </a>
          <span v-else>{{ adTitle }}</span>
        </h3>
        <p v-if="adDescription">{{ adDescription }}</p>
      </div>
    </div>

    <footer class="ad-footer">
      <a
        v-if="normalizedUrl"
        :href="normalizedUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="ad-cta"
        @click="handleClick"
      >
        {{ adCta }}
      </a>
      <button v-else class="ad-cta" :disabled="true" type="button">
        {{ adCta }}
      </button>
    </footer>
  </article>
</template>

<style scoped>
.ad-card {
  background:
    radial-gradient(circle at 80% 10%, rgba(251, 191, 36, 0.18), transparent 45%),
    linear-gradient(135deg, #fffdf5 0%, #fff8e7 45%, #ffffff 100%);
  border: 1px solid #ead39f;
  border-radius: 20px;
  padding: 1rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 10px 26px rgba(117, 84, 24, 0.12);
}

.ad-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.9rem;
}

.ad-badges {
  display: flex;
  gap: 0.45rem;
  align-items: center;
}

.ad-badge {
  background: #0f172a;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  letter-spacing: 0.02em;
}

.ad-caption {
  color: #7c5a13;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(250, 204, 21, 0.25);
  border: 1px solid rgba(217, 119, 6, 0.2);
  padding: 0.22rem 0.5rem;
  border-radius: 999px;
}

.ad-signal {
  color: #6b7280;
  font-size: 0.76rem;
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
  font-size: 1rem;
  line-height: 1.25;
}

.ad-title-link {
  color: #111827;
  text-decoration: none;
}

.ad-title-link:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
  color: #0f766e;
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
  text-decoration: none;
  display: inline-flex;
  align-items: center;
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
