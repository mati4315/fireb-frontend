<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import LoginCard from '@/components/common/LoginCard.vue'

const router = useRouter()
const route = useRoute()

const handleSuccess = (isNewUser = false) => {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  const safeRedirect = redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : ''
  void router.replace(safeRedirect || (isNewUser ? '/perfil' : '/'))
}
</script>

<template>
  <main class="login-page">
    <LoginCard @success="handleSuccess" />
  </main>
</template>

<style scoped>
.login-page {
  min-height: calc(100vh - 70px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: radial-gradient(circle at top right, var(--accent-bg), transparent 400px),
              radial-gradient(circle at bottom left, var(--accent-bg), transparent 400px);
}
</style>
