import { ref, readonly, onMounted, onUnmounted } from 'vue'

const isVisible = ref(true)
const isNearTop = ref(true)
let consumers = 0
let lastScrollY = 0
let frame: number | null = null

const updateScroll = () => {
  frame = null
  const currentY = window.scrollY
  isNearTop.value = currentY <= 64
  if (currentY < 10) {
    isVisible.value = true
    lastScrollY = currentY
  } else if (Math.abs(currentY - lastScrollY) > 5) {
    isVisible.value = currentY < lastScrollY
    lastScrollY = currentY
  }
}

const handleScroll = () => {
  if (frame === null) frame = window.requestAnimationFrame(updateScroll)
}

// App and Home share one listener; reactive state changes only at UI thresholds.
export function useHeaderScroll() {
  onMounted(() => {
    if (consumers++ === 0) {
      lastScrollY = window.scrollY
      isNearTop.value = lastScrollY <= 64
      isVisible.value = true
      window.addEventListener('scroll', handleScroll, { passive: true })
    }
  })

  onUnmounted(() => {
    if (--consumers === 0) {
      window.removeEventListener('scroll', handleScroll)
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = null
    }
  })

  return { isVisible: readonly(isVisible), isNearTop: readonly(isNearTop) }
}
