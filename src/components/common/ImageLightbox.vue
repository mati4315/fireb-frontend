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
const isImageLoading = ref(true)
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

const onImageLoad = () => {
  isImageLoading.value = false
}

const onImageError = () => {
  isImageLoading.value = false
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

let lastTouchTime = 0

const toggleZoom = (clientX: number, clientY: number, target: HTMLElement) => {
  if (isZoomed.value) {
    resetZoom()
  } else {
    const rect = target.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    zoomOrigin.value = { x: `${x}%`, y: `${y}%` }
    isZoomed.value = true
  }
}

const onPointerDown = (e: MouseEvent | TouchEvent) => {
  const isTouch = typeof TouchEvent !== 'undefined' && e instanceof TouchEvent
  const currentTime = Date.now()
  
  if (isTouch) {
    lastTouchTime = currentTime
  } else if (currentTime - lastTouchTime < 500) {
    // Ignore ghost mousedown events on mobile immediately following a touch
    return
  }

  const { clientX, clientY } = getClientXY(e)
  
  if (isTouch) {
    const tapLength = currentTime - lastClickTime
    if (tapLength > 0 && tapLength < 350) {
      toggleZoom(clientX, clientY, e.target as HTMLElement)
      if (e.cancelable) e.preventDefault()
      isDragging.value = false
      lastClickTime = 0 // Reset to avoid triple-tap zooming out
      return
    }
  }

  // Record for touch double-tap
  if (isTouch) {
    lastClickTime = currentTime
  }

  // Handle drag / pan start
  if (isZoomed.value) {
    isDragging.value = true
    dragStartX = clientX
    dragStartY = clientY
    lastPanX = panX.value
    lastPanY = panY.value
  } else {
    dragStartX = clientX
    dragStartY = clientY
    isDragging.value = true
  }
}

const onDblClick = (e: MouseEvent) => {
  if (Date.now() - lastTouchTime < 500) return
  toggleZoom(e.clientX, e.clientY, e.target as HTMLElement)
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
    isImageLoading.value = true
  },
  { immediate: true }
)

watch(currentImage, () => {
  if (!props.open) return
  isImageLoading.value = true
})

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

      <div v-if="isImageLoading" class="image-loader" aria-live="polite" aria-label="Cargando imagen">
        <span class="spinner" aria-hidden="true"></span>
      </div>

      <img 
        :src="currentImage" 
        class="lightbox-image" 
        :class="{ 'zoomed': isZoomed, 'dragging': isDragging }"
        :style="[
          isZoomed
            ? { transformOrigin: `${zoomOrigin.x} ${zoomOrigin.y}`, transform: `translate(${panX}px, ${panY}px) scale(2.5)` }
            : {},
          { opacity: isImageLoading ? 0 : 1 }
        ]"
        alt="Imagen ampliada" 
        @mousedown.stop="onPointerDown"
        @touchstart.stop="onPointerDown"
        @dblclick.stop="onDblClick"
        @mousemove.stop="onDrag"
        @touchmove.stop="onDrag"
        @mouseup.stop="endDrag"
        @touchend.stop="endDrag"
        @mouseleave.stop="endDrag"
        @load="onImageLoad"
        @error="onImageError"
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
  transition: transform 0.25s ease-out, opacity 0.18s linear;
  cursor: zoom-in;
  touch-action: none;
  will-change: transform;
}

.image-loader {
  position: absolute;
  z-index: 2015;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(2px);
}

.spinner {
  width: 26px;
  height: 26px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
  width: 35px;
  height: 35px;
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
