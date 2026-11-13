<script setup lang="ts">
import { onMounted } from 'vue'

const redirectEndpoint = 'https://us-central1-cdeluar-ddefc.cloudfunctions.net/redirectShortLinkOne'

onMounted(() => {
  window.location.replace(redirectEndpoint)
})
</script>

<template>
  <main class="short-link-redirect" role="status">
    <p>Redirigiendo…</p>
  </main>
</template>

<style scoped>
.short-link-redirect {
  min-height: 60vh;
  display: grid;
  place-items: center;
  color: var(--text);
}
</style>
