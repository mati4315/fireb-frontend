<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useModuleStore } from '@/stores/moduleStore'

const moduleStore = useModuleStore()
const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const autoplayBlocked = ref(false)
const isCollapsed = ref(false)

const radioConfig = computed(() => moduleStore.modules.radio)
const isVisible = computed(() => radioConfig.value.enabled && radioConfig.value.active)
const hasAudio = computed(() => Boolean(radioConfig.value.audioUrl.trim()))
const radioTitle = computed(() => radioConfig.value.title || 'Radio en vivo')
const radioDescription = computed(() => radioConfig.value.description || '')
const radioLiveUrl = computed(() => radioConfig.value.liveUrl.trim())
const radioCtaLabel = computed(() => radioConfig.value.ctaLabel || 'Ir al link')

const pauseAudio = () => {
  audioRef.value?.pause()
}

const tryPlay = async () => {
  if (!audioRef.value || !hasAudio.value) return

  try {
    autoplayBlocked.value = false
    await audioRef.value.play()
  } catch {
    autoplayBlocked.value = true
    isPlaying.value = false
  }
}

const togglePlayback = async () => {
  if (!audioRef.value || !hasAudio.value) return

  if (isPlaying.value) {
    pauseAudio()
    return
  }

  await tryPlay()
}

const handlePlay = () => {
  isPlaying.value = true
  autoplayBlocked.value = false
}

const handlePause = () => {
  isPlaying.value = false
}

const handlePlayIconClick = async () => {
  if (!hasAudio.value) return

  if (isCollapsed.value) {
    isCollapsed.value = false
    if (!isPlaying.value) {
      await tryPlay()
    }
    return
  }

  await togglePlayback()
}

const toggleCollapsed = () => {
  isCollapsed.value = !isCollapsed.value
  if (isCollapsed.value) {
    autoplayBlocked.value = false
  }
}

const handleCollapseAction = () => {
  toggleCollapsed()
}

watch(
  [isVisible, hasAudio],
  async ([visible, available]) => {
    if (!visible) {
      pauseAudio()
      isPlaying.value = false
      autoplayBlocked.value = false
      return
    }

    await nextTick()
    if (available) {
      void tryPlay()
    }
  },
  { immediate: true }
)

onMounted(() => {
  moduleStore.initModulesListener()
})

onBeforeUnmount(() => {
  pauseAudio()
})
</script>

<template>
  <div
    v-if="isVisible"
    class="radio-dock"
    :class="{ 'radio-dock--collapsed': isCollapsed }"
    role="region"
    aria-label="Reproductor de radio"
  >
    <div class="radio-dock__inner">
      <div class="radio-dock__info">
        <button
          class="radio-dock__play-icon"
          type="button"
          :disabled="!hasAudio"
          :aria-label="isPlaying ? 'Pausar radio' : 'Reproducir radio'"
          @click="handlePlayIconClick"
        >
          <span class="radio-dock__play-icon-shape" :class="{ 'is-playing': isPlaying && hasAudio }">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>

        <div class="radio-dock__text">
          <div class="radio-dock__headline">
            <span class="radio-dock__badge">EN VIVO</span>
            <strong class="radio-dock__title">{{ radioTitle }}</strong>
          </div>
          <p v-if="radioDescription" class="radio-dock__description">{{ radioDescription }}</p>
          <p v-else-if="!hasAudio" class="radio-dock__description">
            Configura la URL del audio en el dashboard para activar el streaming.
          </p>
        </div>
      </div>

      <div class="radio-dock__actions">
        <div v-if="isPlaying && hasAudio" class="radio-dock__wave" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>

        <a
          v-if="radioLiveUrl"
          class="radio-dock__button radio-dock__button--link"
          :href="radioLiveUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ radioCtaLabel }}
        </a>
      </div>

      <button
        v-if="!isCollapsed"
        class="radio-dock__button radio-dock__button--toggle"
        type="button"
        aria-label="Ocultar radio"
        @click="handleCollapseAction"
      >
        Ocultar
      </button>
    </div>

    <audio
      ref="audioRef"
      class="radio-audio"
      :src="radioConfig.audioUrl"
      :preload="hasAudio ? 'auto' : 'none'"
      playsinline
      @play="handlePlay"
      @pause="handlePause"
      @ended="handlePause"
    />

  </div>
</template>

<style scoped>
.radio-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1100;
  padding: 0;
  pointer-events: none;
  overflow: hidden;
}

.radio-dock__inner {
  width: 100%;
  margin: 0;
  padding: 0.6rem 0.85rem calc(0.6rem + env(safe-area-inset-bottom));
  position: relative;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-bottom: 0;
  border-radius: 18px 18px 0 0;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--card-bg)), var(--card-bg)),
    var(--card-bg);
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.18);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  pointer-events: auto;
  transition:
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 220ms ease,
    padding 220ms ease,
    box-shadow 220ms ease;
  transform: translateY(0);
}

.radio-dock--collapsed .radio-dock__inner {
  width: fit-content;
  margin-left: auto;
  margin-right: 0.4rem;
  padding: 0.4rem 0.45rem 0.36rem 0.52rem;
  border-radius: 999px;
  transform: translateY(-2px);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.12);
}

.radio-dock--collapsed .radio-dock__text {
  display: none;
}

.radio-dock--collapsed .radio-dock__info {
  gap: 0;
}

.radio-dock--collapsed .radio-dock__wave {
  display: none;
}

.radio-dock--collapsed .radio-dock__button--link {
  display: none;
}

.radio-dock--collapsed .radio-dock__button--toggle {
  display: none;
}

.radio-dock--collapsed .radio-dock__actions {
  display: none;
}

.radio-dock__info {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.radio-dock__play-icon {
  width: 2.35rem;
  height: 2.35rem;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, var(--card-bg));
  color: var(--text-h);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 8%, transparent);
}

.radio-dock__play-icon:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.radio-dock__play-icon-shape {
  width: 0.95rem;
  height: 0.95rem;
  position: relative;
  display: block;
}

.radio-dock__play-icon-shape span {
  position: absolute;
  inset: 0;
}

.radio-dock__play-icon-shape span:first-child {
  width: 0;
  height: 0;
  border-top: 0.47rem solid transparent;
  border-bottom: 0.47rem solid transparent;
  border-left: 0.68rem solid currentColor;
  left: 0.12rem;
  top: 0;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.radio-dock__play-icon-shape span:nth-child(2),
.radio-dock__play-icon-shape span:nth-child(3) {
  width: 0.16rem;
  height: 0.9rem;
  border-radius: 999px;
  background: currentColor;
  opacity: 0;
  transform: scaleY(0.8);
}

.radio-dock__play-icon-shape span:nth-child(2) {
  left: 0.07rem;
}

.radio-dock__play-icon-shape span:nth-child(3) {
  left: 0.32rem;
}

.radio-dock__play-icon-shape.is-playing span:first-child {
  opacity: 0;
  transform: scale(0.5);
}

.radio-dock__play-icon-shape.is-playing span:nth-child(2),
.radio-dock__play-icon-shape.is-playing span:nth-child(3) {
  opacity: 1;
  animation: pulseBars 1.35s ease-in-out infinite;
}

.radio-dock__play-icon-shape.is-playing span:nth-child(3) {
  animation-delay: 0.15s;
}

.radio-dock__badge {
  flex-shrink: 0;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  background: #16a34a;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.radio-dock__text {
  min-width: 0;
  display: grid;
  gap: 0.12rem;
  transition: opacity 220ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.radio-dock__headline {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  flex-wrap: wrap;
}

.radio-dock__title {
  color: var(--text-h);
  font-size: 0.9rem;
  line-height: 1.2;
}

.radio-dock__description {
  margin: 0;
  color: var(--text);
  font-size: 0.78rem;
  line-height: 1.35;
}

.radio-dock__wave {
  display: flex;
  align-items: flex-end;
  gap: 0.22rem;
  width: min(8.75rem, 42vw);
  height: 0.6rem;
  margin: 0 0.15rem;
  opacity: 0.9;
  overflow: hidden;
  transition: opacity 220ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.radio-dock__wave span {
  flex: 1 1 0;
  width: auto;
  height: 30%;
  border-radius: 999px;
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--accent) 55%, var(--text-h)),
    color-mix(in srgb, var(--accent) 88%, var(--text-h))
  );
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 14%, transparent);
  transform-origin: bottom center;
  animation: waveBars 1.8s ease-in-out infinite;
}

.radio-dock__wave span:nth-child(1) {
  animation-delay: 0s;
  height: 24%;
}

.radio-dock__wave span:nth-child(2) {
  animation-delay: 0.06s;
  height: 38%;
}

.radio-dock__wave span:nth-child(3) {
  animation-delay: 0.12s;
  height: 58%;
}

.radio-dock__wave span:nth-child(4) {
  animation-delay: 0.18s;
  height: 76%;
}

.radio-dock__wave span:nth-child(5) {
  animation-delay: 0.24s;
  height: 92%;
}

.radio-dock__wave span:nth-child(6) {
  animation-delay: 0.3s;
  height: 64%;
}

.radio-dock__wave span:nth-child(7) {
  animation-delay: 0.36s;
  height: 40%;
}

.radio-dock__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  transition: gap 220ms ease;
}

.radio-dock__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.3rem;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  border: 1px solid transparent;
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

.radio-dock__button--toggle {
  background: transparent;
  color: var(--text-h);
  border-color: var(--accent-border);
  position: absolute;
  top: 0.55rem;
  right: 0.65rem;
}

.radio-dock__button--link {
  background: transparent;
  color: var(--text-h);
  border-color: var(--accent-border);
}

.radio-dock__button--link:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.radio-audio {
  display: none;
}

@media (max-width: 760px) {
  .radio-dock {
    padding: 0;
  }

  .radio-dock__inner {
    padding: 0.5rem 0.65rem calc(0.5rem + env(safe-area-inset-bottom));
    flex-direction: row;
    align-items: center;
    gap: 0.55rem;
  }

  .radio-dock__info {
    align-items: center;
    gap: 0.45rem;
  }

  .radio-dock__actions {
    justify-content: flex-end;
    gap: 0.4rem;
    flex-wrap: nowrap;
  }

  .radio-dock__button {
    flex: 0 0 auto;
    min-height: 2rem;
    padding: 0.38rem 0.72rem;
    font-size: 0.76rem;
  }

  .radio-dock__button--link {
    display: none;
  }

  .radio-dock__wave {
    width: 5.6rem;
    margin: 0 0 0 0.05rem;
  }

  .radio-dock__title {
    font-size: 0.84rem;
  }

  .radio-dock__description {
    font-size: 0.72rem;
  }

  .radio-dock__play-icon {
    width: 2.15rem;
    height: 2.15rem;
  }

  .radio-dock__wave {
    height: 0.68rem;
  }

  .radio-dock--collapsed .radio-dock__inner {
    margin-right: 0.3rem;
    padding: 0.34rem 0.38rem 0.3rem 0.46rem;
    transform: translateY(-1px);
  }

  .radio-dock__button--toggle {
    top: 0.45rem;
    right: 0.5rem;
  }
}

@keyframes pulseBars {
  0%, 100% {
    transform: scaleY(0.55);
  }
  50% {
    transform: scaleY(1.1);
  }
}

@keyframes waveBars {
  0%, 100% {
    transform: scaleY(0.28);
    opacity: 0.45;
  }
  25% {
    transform: scaleY(0.72);
    opacity: 0.72;
  }
  50% {
    transform: scaleY(1.08);
    opacity: 1;
  }
  75% {
    transform: scaleY(0.58);
    opacity: 0.68;
  }
}
</style>
