import { ref, onMounted, onUnmounted } from 'vue'

export function useHeaderScroll() {
  const isVisible = ref(true)
  const lastScrollY = ref(window.scrollY)
  const scrollThreshold = 5 // Ajuste de sensibilidad

  const handleScroll = () => {
    const currentScrollY = window.scrollY
    
    // Si estamos al principio de la página, siempre mostrar
    if (currentScrollY < 10) {
      isVisible.value = true
      lastScrollY.value = currentScrollY
      return
    }

    // Detectar dirección del scroll solo si superamos el umbral
    if (Math.abs(currentScrollY - lastScrollY.value) > scrollThreshold) {
      if (currentScrollY > lastScrollY.value) {
        // Scrolling DOWN
        isVisible.value = false
      } else {
        // Scrolling UP
        isVisible.value = true
      }
      lastScrollY.value = currentScrollY
    }
  }

  onMounted(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', handleScroll)
  })

  return { isVisible }
}
