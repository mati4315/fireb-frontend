<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Share } from '@capacitor/share'
import { registerPlugin } from '@capacitor/core'
import { isNativePlatform } from '@/platform/capacitor'
import { getShareContentType, trackAppEvent } from '@/utils/analytics'

const props = defineProps<{
  open: boolean
  url: string
  title?: string
  text?: string
}>()

const emit = defineEmits<{ close: [] }>()
const copied = ref(false)
const TargetShare = registerPlugin<{ shareTo(options: { target: 'facebook' | 'whatsapp' | 'x'; url: string }): Promise<{ target: string }> }>('TargetShare')

const openShareTarget = async (target: 'facebook' | 'whatsapp' | 'x') => {
  if (!props.url) return
  const contentType = getShareContentType(props.url)
  const encodedUrl = encodeURIComponent(props.url)
  const targetUrl = target === 'facebook'
    ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    : target === 'whatsapp'
      ? `https://wa.me/?text=${encodedUrl}`
      : `https://twitter.com/intent/tweet?url=${encodedUrl}`

  try {
    if (isNativePlatform()) {
      try {
        // Open the selected social app directly on Android instead of sending
        // its web share URL to the app's internal browser.
        await TargetShare.shareTo({ target, url: props.url })
        trackAppEvent('share_target_opened', { content_type: contentType, target, platform: 'android' })
      } catch (error) {
        // If that app is missing or does not handle ACTION_SEND, keep sharing
        // available through Android's native app chooser (never the WebView).
        console.warn(`No se pudo abrir ${target}; se mostrará el selector de Android.`, error)
        await Share.share({ url: props.url, dialogTitle: 'Elegir aplicación para compartir' })
        trackAppEvent('share_sheet_opened', { content_type: contentType, target })
      }
    } else {
      // `noopener` can make window.open return null even when the tab opened.
      // Do not fall back to location.assign: that replaces the page being shared.
      window.open(targetUrl, '_blank', 'noopener,noreferrer')
      trackAppEvent('share_target_opened', { content_type: contentType, target })
    }
    emit('close')
  } catch (error) {
    console.error('No se pudo abrir la opción para compartir:', error)
  }
}

const copyShareUrl = async () => {
  if (!props.url) return
  try {
    await navigator.clipboard.writeText(props.url)
  } catch {
    const input = document.createElement('textarea')
    input.value = props.url
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    input.remove()
  }
  copied.value = true
  trackAppEvent('share_link_copied', { content_type: getShareContentType(props.url) })
  window.setTimeout(() => {
    copied.value = false
    emit('close')
  }, 900)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.open) emit('close')
}

watch(() => props.open, (open) => {
  if (!open) copied.value = false
})

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="share-dialog-backdrop" @click.self="emit('close')">
      <section class="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
        <header class="share-dialog-header">
          <div>
            <span class="share-dialog-eyebrow">COMPARTIR</span>
            <h2 id="share-dialog-title">{{ title || 'Compartir publicación' }}</h2>
          </div>
          <button class="share-dialog-close" type="button" aria-label="Cerrar" @click="emit('close')">×</button>
        </header>
        <div class="share-dialog-actions">
          <button type="button" class="share-target facebook" @click="openShareTarget('facebook')">
            <span class="share-target-icon">f</span><span>Facebook</span>
          </button>
          <button type="button" class="share-target whatsapp" @click="openShareTarget('whatsapp')">
            <svg class="share-target-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.1 0C5.6 0 .3 5.3.3 11.8c0 2.1.6 4.1 1.6 5.9L0 24l6.5-1.7a11.8 11.8 0 0 0 5.6 1.4h.1c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.5-8.4ZM12.1 21.7c-1.7 0-3.4-.5-4.8-1.3l-.3-.2-3.9 1 1-3.8-.2-.4a9.8 9.8 0 1 1 8.2 4.7Zm5.4-7.3c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.4.1-.6l.5-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.5-.4-.7-.4h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.1 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.6.2-1.1.2-1.3-.1-.2-.3-.3-.6-.4Z"/></svg>
            <span>WhatsApp</span>
          </button>
          <button type="button" class="share-target x" @click="openShareTarget('x')">
            <span class="share-target-icon">𝕏</span><span>X</span>
          </button>
          <button type="button" class="share-target copy" @click="copyShareUrl">
            <svg class="share-target-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>{{ copied ? 'Enlace copiado' : 'C. enlace' }}</span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.share-dialog-backdrop {
  position: fixed;
  z-index: 5000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(10, 15, 25, 0.56);
  backdrop-filter: blur(5px);
}

.share-dialog {
  width: min(100%, 430px);
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--card-bg);
  color: var(--text-h);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
}

.share-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.share-dialog-eyebrow {
  color: var(--accent);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.share-dialog-header h2 {
  margin: 0.2rem 0 0;
  font-size: 1.1rem;
}

.share-dialog-close {
  width: 2.3rem;
  height: 2.3rem;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--bg);
  color: var(--text-h);
  font-size: 1.4rem;
  cursor: pointer;
}

.share-dialog-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.share-target {
  display: flex;
  min-height: 3rem;
  align-items: center;
  gap: 0.6rem;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--bg);
  color: var(--text-h);
  padding: 0.65rem 0.75rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: transform 140ms ease, border-color 140ms ease;
}

.share-target:hover {
  transform: translateY(-1px);
  border-color: var(--accent);
}

.share-target-icon {
  display: grid;
  width: 1.4rem;
  height: 1.4rem;
  flex: 0 0 1.4rem;
  place-items: center;
  font-size: 1.2rem;
  font-weight: 900;
}

.share-target.whatsapp .share-target-icon,
.share-target.copy .share-target-icon {
  fill: currentColor;
  stroke: currentColor;
}

.share-target.facebook .share-target-icon { color: #1877f2; font-family: Arial, sans-serif; font-size: 1.5rem; }
.share-target.whatsapp .share-target-icon { color: #25d366; }
.share-target.x .share-target-icon { color: var(--text-h); }
.share-target.copy .share-target-icon { color: var(--accent); }
</style>
