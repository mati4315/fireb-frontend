<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useRoute } from 'vue-router'
import { isStaffUser } from '@/utils/roles'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const route = useRoute()

const isUserMenuOpen = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)

const canManageStaff = computed(() => {
  const rol = authStore.userProfile?.rol
  const email = authStore.user?.email || authStore.userProfile?.email
  const uid = authStore.user?.uid
  return authStore.isAuthenticated && isStaffUser(rol, email, uid, authStore.tokenClaims)
})

const toggleUserMenu = () => {
  isUserMenuOpen.value = !isUserMenuOpen.value
}

const closeUserMenu = () => {
  isUserMenuOpen.value = false
}

const handleClickOutside = (event: MouseEvent) => {
  if (!isUserMenuOpen.value) return
  const target = event.target as Node | null
  if (!target) return

  if (userMenuRef.value && !userMenuRef.value.contains(target)) {
    closeUserMenu()
  }
}

const handleLogout = async () => {
  closeUserMenu()
  await authStore.logout()
}

watch(
  () => route.fullPath,
  () => {
    closeUserMenu()
  }
)

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="app-container">
    <header class="main-header">
      <div class="nav-content">
        <RouterLink to="/" class="logo">
          <span class="logo-text">Cdelu<span class="accent">AR</span></span>
        </RouterLink>
        
        <nav class="main-nav">
          <RouterLink to="/" class="nav-link">Explorar</RouterLink>
          
          <template v-if="!authStore.isAuthenticated">
            <RouterLink to="/login" class="nav-link login-btn">Iniciar Sesión</RouterLink>
          </template>
          
          <div v-else ref="userMenuRef" class="user-menu">
            <button class="user-trigger" @click.stop="toggleUserMenu">
              <div class="user-info">
                <img
                  v-if="authStore.userProfile?.profilePictureUrl"
                  :src="authStore.userProfile.profilePictureUrl"
                  class="avatar"
                />
                <div v-else class="avatar-placeholder">
                  {{ authStore.userProfile?.nombre?.charAt(0) || 'U' }}
                </div>
                <span class="user-name">{{ authStore.userProfile?.nombre || 'Mi Perfil' }}</span>
                <span v-if="canManageStaff" class="badge admin">Staff</span>
              </div>
              <span class="menu-caret" :class="{ open: isUserMenuOpen }">v</span>
            </button>

            <div v-if="isUserMenuOpen" class="user-dropdown">
              <RouterLink
                v-if="canManageStaff"
                to="/ads"
                class="dropdown-item"
                @click="closeUserMenu"
              >
                Gestion ADS
              </RouterLink>

              <RouterLink
                v-if="canManageStaff"
                to="/encuestas/gestion"
                class="dropdown-item"
                @click="closeUserMenu"
              >
                Gestion Encuestas
              </RouterLink>

              <button class="dropdown-item danger" @click="handleLogout">
                Cerrar sesion
              </button>
            </div>
          </div>

          <button @click="themeStore.toggleTheme" class="theme-toggle" aria-label="Cambiar tema">
            <span v-if="themeStore.isDark">☀️</span>
            <span v-else>🌙</span>
          </button>
        </nav>
      </div>
    </header>

    <main class="content-wrapper">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  background-color: var(--bg);
}

.main-header {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: var(--glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}

.nav-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0.75rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  text-decoration: none;
}

.logo-text {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-h);
  letter-spacing: -0.5px;
}

.accent {
  color: var(--accent);
}

.main-nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.nav-link {
  text-decoration: none;
  color: var(--text);
  font-weight: 500;
  transition: color 0.2s;
}

.nav-link:hover {
  color: var(--accent);
}

.login-btn {
  background: var(--accent);
  color: white;
  padding: 0.5rem 1.25rem;
  border-radius: 99px;
  transition: opacity 0.2s;
}

.login-btn:hover {
  color: white;
  opacity: 0.9;
}

.user-menu {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem;
  padding-left: 1rem;
  background: var(--accent-bg);
  border-radius: 99px;
  border: 1px solid var(--accent-border);
}

.user-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.avatar, .avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.theme-toggle {
  background: var(--social-bg);
  border: 1px solid var(--border);
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1.1rem;
  transition: all 0.2s;
  color: var(--text-h);
}

.theme-toggle:hover {
  transform: translateY(-2px);
  background: var(--border);
}

.avatar-placeholder {
  font-size: 0.8rem;
}

.user-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-h);
}

.badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.5rem;
  border-radius: 4px;
  font-weight: 700;
  text-transform: uppercase;
}

.badge.admin {
  background: #ff4d4d;
  color: white;
}

.menu-caret {
  font-size: 0.75rem;
  color: var(--text);
  transition: transform 0.2s ease;
}

.menu-caret.open {
  transform: rotate(180deg);
}

.user-dropdown {
  position: absolute;
  top: calc(100% + 0.6rem);
  right: 0;
  min-width: 190px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  overflow: hidden;
  z-index: 10;
}

.dropdown-item {
  width: 100%;
  text-align: left;
  display: block;
  padding: 0.75rem 0.9rem;
  color: var(--text-h);
  text-decoration: none;
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 0.9rem;
}

.dropdown-item:hover {
  background: var(--social-bg);
}

.dropdown-item.danger {
  color: #b91c1c;
}

.content-wrapper {
  max-width: 1200px;
  margin: 0 auto;
}
</style>
