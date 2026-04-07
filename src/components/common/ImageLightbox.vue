<script setup lang="ts">
import { computed, onBeforeUnmount, watch, ref } from 'vue'

const props = defineProps<{
  open: boolean
  images: string[]
  initialIndex?: number
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const currentIndex = ref(0)

const safeImages = computed(() => props.images.filter(Boolean))
const hasMultiple = computed(() => safeImages.value.length > 1)
const currentImage = computed(() => safeImages.value[currentIndex.value] || '')

const close = () => emit('close')

const normalizeIndex = (nextIndex: number) => {
  const total = safeImages.value.length
  if (total === 0) return 0
  if (nextIndex < 0) return total - 1
  if (nextIndex >= total) return 0
  return nextIndex
}

const goPrev = () => {
  currentIndex.value = normalizeIndex(currentIndex.value - 1)
}

const goNext = () => {
  currentIndex.value = normalizeIndex(currentIndex.value + 1)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!props.open) return
  if (event.key === 'Escape') close()
  if (event.key === 'ArrowLeft') goPrev()
  if (event.key === 'ArrowRight') goNext()
}

watch(
  () => [props.open, props.initialIndex, safeImages.value.length],
  () => {
    if (!props.open) return
    const next = props.initialIndex ?? 0
    currentIndex.value = normalizeIndex(next)
  },
  { immediate: true }
)

watch(
  () => props.open,
  (isOpen) => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
  }
)

window.addEventListener('keydown', handleKeydown)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open && currentImage" class="lightbox-overlay" @click.self="close">
      <button class="close-btn" type="button" @click="close">x</button>

      <button
        v-if="hasMultiple"
        class="nav-btn prev"
        type="button"
        @click.stop="goPrev"
      >
        ‹
      </button>

      <img :src="currentImage" class="lightbox-image" alt="Imagen ampliada" />

      <button
        v-if="hasMultiple"
        class="nav-btn next"
        type="button"
        @click.stop="goNext"
      >
        ›
      </button>

      <div v-if="hasMultiple" class="counter">
        {{ currentIndex + 1 }} / {{ safeImages.length }}
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(10, 10, 10, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.lightbox-image {
  max-width: min(1200px, 94vw);
  max-height: 88vh;
  object-fit: contain;
  border-radius: 14px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.close-btn,
.nav-btn {
  position: absolute;
  border: 0;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  font-size: 1.2rem;
  cursor: pointer;
  backdrop-filter: blur(5px);
}

.close-btn {
  top: 1.1rem;
  right: 1.1rem;
}

.nav-btn {
  top: 50%;
  transform: translateY(-50%);
  font-size: 2rem;
  line-height: 1;
}

.nav-btn.prev {
  left: 1.1rem;
}

.nav-btn.next {
  right: 1.1rem;
}

.counter {
  position: absolute;
  bottom: 1.1rem;
  left: 50%;
  transform: translateX(-50%);
  color: #fff;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.2);
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
}
</style>
