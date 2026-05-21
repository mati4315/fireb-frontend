<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  endsAt: Date | null;
  status: 'draft' | 'active' | 'closed' | 'completed';
}>();

const nowMs = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const label = computed(() => {
  if (!props.endsAt) return 'Sin cierre definido';
  if (props.status !== 'active') return 'Cerrada';

  const diff = props.endsAt.getTime() - nowMs.value;
  if (diff <= 0) return 'En espera de cierre manual';

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
});

onMounted(() => {
  timer = setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});
</script>

<template>
  <strong>{{ label }}</strong>
</template>
