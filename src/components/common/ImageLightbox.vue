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
const isZoomed = ref(false)
const zoomOrigin = ref({ x: '50%', y: '50%' })
const panX = ref(0)
const panY = ref(0)
const isDragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let lastPanX = 0
let lastPanY = 0
let lastClickTime = 0

const safeImages = computed(() => props.images.filter(Boolean))
const hasMultiple = computed(() => safeImages.value.length > 1)
const currentImage = computed(() => safeImages.value[currentIndex.value] || '')

const resetZoom = () => {
  isZoomed.value = false
  panX.value = 0
  panY.value = 0
  isDragging.value = false
}

const close = () => {
  resetZoom()
  emit('close')
}

const normalizeIndex = (nextIndex: number) => {
  const total = safeImages.value.length
  if (total === 0) return 0
  if (nextIndex < 0) return total - 1
  if (nextIndex >= total) return 0
  return nextIndex
}

const goPrev = () => {
  resetZoom()
  currentIndex.value = normalizeIndex(currentIndex.value - 1)
}

const goNext = () => {
  resetZoom()
  currentIndex.value = normalizeIndex(currentIndex.value + 1)
}

const getClientXY = (e: MouseEvent | TouchEvent) => {
  if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) {
    return { 
      clientX: e.changedTouches[0].clientX, 
      clientY: e.changedTouches[0].clientY 
    }
  } else {
    return { 
      clientX: (e as MouseEvent).clientX, 
      clientY: (e as MouseEvent).clientY 
    }
  }
}

const handleImageInteraction = (e: MouseEvent | TouchEvent) => {
  const currentTime = Date.now()
  const tapLength = currentTime - lastClickTime
  const { clientX, clientY } = getClientXY(e)
  
  if (tapLength < 350 && tapLength > 0) {
    // Double tap
    if (isZoomed.value) {
      resetZoom()
    } else {
      const target = e.target as HTMLElement
      const rect = target.getBoundingClientRect()
    
      const x = ((clientX - rect.left) / rect.width) * 100
      const y = ((clientY - rect.top) / rect.height) * 100
      zoomOrigin.value = { x: `${x}%`, y: `${y}%` }
      isZoomed.value = true
    }
    if (e.cancelable) e.preventDefault()
  } else {
    // Handle single tap start drag
    if (isZoomed.value) {
      isDragging.value = true
      dragStartX = clientX
      dragStartY = clientY
      lastPanX = panX.value
      lastPanY = panY.value
    } else {
      // Setup for potential swipe (optional)
      dragStartX = clientX
      dragStartY = clientY
      isDragging.value = true // We use it to track touch start
    }
  }
  
  lastClickTime = currentTime
}

const onDrag = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return
  const { clientX, clientY } = getClientXY(e)
  const deltaX = clientX - dragStartX
  const deltaY = clientY - dragStartY

  if (isZoomed.value) {
    panX.value = lastPanX + deltaX
    panY.value = lastPanY + deltaY
    if (e.cancelable) e.preventDefault()
  }
}

const endDrag = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return
  isDragging.value = false

  if (!isZoomed.value && hasMultiple.value) {
    // Detect swipe string enough to advance
    const { clientX } = getClientXY(e)
    const deltaX = clientX - dragStartX
    if (deltaX < -50) goNext()
    else if (deltaX > 50) goPrev()
  }
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

      <img 
        :src="currentImage" 
        class="lightbox-image" 
        :class="{ 'zoomed': isZoomed, 'dragging': isDragging }"
        :style="isZoomed ? { transformOrigin: `${zoomOrigin.x} ${zoomOrigin.y}`, transform: `translate(${panX}px, ${panY}px) scale(2.5)` } : {}"
        alt="Imagen ampliada" 
        @mousedown.stop="handleImageInteraction"
        @touchstart.stop="handleImageInteraction"
        @mousemove.stop="onDrag"
        @touchmove.stop="onDrag"
        @mouseup.stop="endDrag"
        @touchend.stop="endDrag"
        @mouseleave.stop="endDrag"
      />

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
  transition: transform 0.25s ease-out;
  cursor: zoom-in;
  touch-action: none;
  will-change: transform;
}

.lightbox-image.zoomed {
  cursor: zoom-out;
  z-index: 2010;
}

.lightbox-image.dragging {
  transition: none;
}

.close-btn,
.nav-btn {
  position: absolute;
  z-index: 2020;
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
