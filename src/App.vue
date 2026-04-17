<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useNotificationStore, type NotificationRecord } from '@/stores/notificationStore'
import { useRoute } from 'vue-router'
import { isAdminUser, isStaffUser } from '@/utils/roles'

import { useHeaderScroll } from '@/composables/useHeaderScroll'

const { isVisible: isHeaderVisible } = useHeaderScroll()
const scrollY = ref(0)
const handleScrollY = () => { scrollY.value = window.scrollY }

onMounted(() => {
  window.addEventListener('scroll', handleScrollY, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScrollY)
})

const shouldHideHeader = computed(() => !isHeaderVisible.value && scrollY.value > 64)

const authStore = useAuthStore()
const themeStore = useThemeStore()
const notificationStore = useNotificationStore()
const route = useRoute()
const router = useRouter()

const isUserMenuOpen = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)
const isNotificationsOpen = ref(false)
const notificationsRef = ref<HTMLElement | null>(null)

const canManageStaff = computed(() => {
  const rol = authStore.userProfile?.rol
  const email = authStore.user?.email || authStore.userProfile?.email
  const uid = authStore.user?.uid
  return authStore.isAuthenticated && isStaffUser(rol, email, uid, authStore.tokenClaims)
})

const canManageComments = computed(() => {
  const rol = authStore.userProfile?.rol
  const email = authStore.user?.email || authStore.userProfile?.email
  const uid = authStore.user?.uid
  return authStore.isAuthenticated && isAdminUser(rol, email, uid, authStore.tokenClaims)
})

const toggleUserMenu = () => {
  isUserMenuOpen.value = !isUserMenuOpen.value
}

const closeUserMenu = () => {
  isUserMenuOpen.value = false
}

const toggleNotifications = async () => {
  isNotificationsOpen.value = !isNotificationsOpen.value
  if (isNotificationsOpen.value) {
    await notificationStore.init()
  }
}

const closeNotifications = () => {
  isNotificationsOpen.value = false
}

const quickNotifications = computed(() =>
  notificationStore.items.slice(0, 6)
)

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as Node | null
  if (!target) return

  if (isUserMenuOpen.value && userMenuRef.value && !userMenuRef.value.contains(target)) {
    closeUserMenu()
  }
  if (isNotificationsOpen.value && notificationsRef.value && !notificationsRef.value.contains(target)) {
    closeNotifications()
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
    closeNotifications()
  }
)

watch(
  () => authStore.user?.uid || '',
  async (nextUid) => {
    if (!nextUid) {
      notificationStore.cleanup()
      return
    }
    await notificationStore.init()
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleClickOutside)
  notificationStore.cleanup()
})

const openNotificationItem = async (item: NotificationRecord) => {
  if (!item.isRead) {
    await notificationStore.markNotificationRead(item.id)
  }
  closeNotifications()
  await router.push(item.targetPath || '/notificaciones')
}

const openNotificationsConfig = async () => {
  closeNotifications()
  await router.push('/notificaciones')
}
</script>

<template>
  <div class="app-container" :style="{ '--header-height': '64px' }">
    <header class="main-header" :class="{ 'header-hidden': shouldHideHeader }">
      <div class="nav-content">
        <RouterLink to="/" class="logo">
          <span class="logo-text">Cdelu<span class="accent">AR</span></span>
        </RouterLink>
        
        <nav class="main-nav">
          <RouterLink to="/secretos" class="secrets-nav-link">Secretos</RouterLink>

          <div class="theme-wrapper" @click="themeStore.toggleTheme">
            <span class="theme-label">Modo:</span>
            <button class="theme-toggle" aria-label="Cambiar tema">
              <span v-if="themeStore.isDark">☀️</span>
              <span v-else>🌙</span>
            </button>
          </div>

          <template v-if="!authStore.isAuthenticated">
            <RouterLink to="/login" class="login-btn">Iniciar Sesión</RouterLink>
          </template>
          
          <div v-else ref="userMenuRef" class="user-menu">
            <div ref="notificationsRef" class="notif-wrap">
              <button class="notif-link" type="button" @click.stop="toggleNotifications">
                <span class="notif-icon">&#128276;</span>
                <span class="notif-label">Notificaciones</span>
                <span v-if="notificationStore.unreadCount > 0" class="notif-badge">
                  {{ notificationStore.unreadCount > 99 ? '99+' : notificationStore.unreadCount }}
                </span>
              </button>

              <div v-if="isNotificationsOpen" class="notif-popover list-panel">
                <p v-if="notificationStore.loading" class="notif-state">Cargando notificaciones...</p>
                <p v-else-if="quickNotifications.length === 0" class="notif-state">Sin notificaciones.</p>

                <ul v-else class="notif-quick-list">
                  <li v-for="item in quickNotifications" :key="item.id">
                    <button
                      class="notif-item-btn"
                      :class="{ unread: !item.isRead }"
                      type="button"
                      @click="openNotificationItem(item)"
                    >
                      <span class="notif-item-text">
                        <strong class="notif-actor">{{ item.actorName }}</strong>
                        {{ ` ${notificationStore.getMessageSuffix(item)}` }}
                      </span>
                      <span class="notif-item-date">{{ notificationStore.formatRelativeDate(item.lastEventAt) }}</span>
                    </button>
                  </li>
                </ul>

                <button class="notif-config-btn" type="button" @click="openNotificationsConfig">
                  Configurar notificaciones
                </button>
              </div>
            </div>
<button class="user-trigger" @click.stop="toggleUserMenu">
              <div class="user-info">
                <div class="avatar-container">
                  <img v-if="authStore.userProfile?.profilePictureUrl" :src="authStore.userProfile.profilePictureUrl" class="nav-avatar" alt="Avatar" />
                  <div v-else class="avatar-placeholder">
                    {{ authStore.userProfile?.nombre?.charAt(0) || 'U' }}
                  </div>
                </div>
                <span class="user-name">{{ authStore.userProfile?.nombre || 'Mi Perfil' }}</span>
              </div>
            </button>

            <div v-if="isUserMenuOpen" class="user-dropdown">
              <RouterLink
                to="/perfil"
                class="dropdown-item"
                @click="closeUserMenu"
              >
                Mi Perfil
              </RouterLink>
              <RouterLink
                to="/config"
                class="dropdown-item"
                @click="closeUserMenu"
              >
                Configuracion
              </RouterLink>
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

              <RouterLink
                v-if="canManageStaff"
                to="/loteria/gestion"
                class="dropdown-item"
                @click="closeUserMenu"
              >
                Gestion Loteria
              </RouterLink>

              <RouterLink
                v-if="canManageComments"
                to="/comentarios/gestion"
                class="dropdown-item"
                @click="closeUserMenu"
              >
                Gestion Comentarios
              </RouterLink>

              <RouterLink
                v-if="canManageComments"
                to="/usuarios/gestion"
                class="dropdown-item"
                @click="closeUserMenu"
              >
                Gestionar Usuarios
              </RouterLink>

              <button class="dropdown-item danger" @click="handleLogout">
                Cerrar sesion
              </button>
            </div>
          </div>
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
  /* Animación eliminada a petición del usuario */
}

.main-header.header-hidden {
  transform: translateY(-100%);
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
  cursor: pointer;
  transition: transform 0.2s ease;
  display: inline-block;
}

.logo:hover .logo-text {
  transform: scale(1.02);
}

.accent {
  color: var(--accent);
}

.main-nav {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.secrets-nav-link {
  text-decoration: none;
  color: var(--text-h);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.4rem 0.78rem;
  font-size: 0.85rem;
  font-weight: 700;
  background: var(--bg);
}

.secrets-nav-link:hover {
  border-color: var(--accent-border);
  color: var(--accent);
}

.theme-wrapper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.4rem 0.6rem;
  border-radius: 99px;
  transition: background 0.2s;
}

.theme-wrapper:hover {
  background: var(--accent-bg);
}

.theme-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-s);
  user-select: none;
}

.login-btn {
  text-decoration: none;
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
  gap: 0.35rem;
  padding: 0.25rem 0.5rem 0.25rem 0.35rem;
  background: var(--accent-bg);
  border-radius: 99px;
  border: 1px solid var(--accent-border);
}

.notif-wrap {
  position: relative;
}

.notif-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 0;
  background: transparent;
  color: var(--text-h);
  border-radius: 999px;
  padding: 0.35rem 0.5rem;
  position: relative;
  cursor: pointer;
}

.notif-link:hover {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.notif-icon {
  font-size: 0.95rem;
  line-height: 1;
}

.notif-label {
  font-size: 0.8rem;
  font-weight: 600;
}

.notif-badge {
  min-width: 1rem;
  height: 1rem;
  border-radius: 999px;
  background: #d11a2a;
  color: #fff;
  font-size: 0.65rem;
  line-height: 1rem;
  text-align: center;
  padding: 0 0.2rem;
}

.notif-popover {
  position: absolute;
  top: calc(100% + 0.55rem);
  right: 0;
  width: min(420px, 90vw);
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card-bg);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.2);
  z-index: 25;
  padding: 0.75rem;
}

.notif-state {
  margin: 0;
  color: var(--text-s);
  font-size: 0.9rem;
}

.notif-quick-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
  max-height: 320px;
  overflow-y: auto;
}

.notif-item-btn {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-h);
  padding: 0.55rem 0.65rem;
  display: grid;
  gap: 0.2rem;
  text-align: left;
  cursor: pointer;
}

.notif-item-btn.unread {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--bg));
}

.notif-item-text {
  font-size: 0.88rem;
  line-height: 1.25;
}

.notif-actor {
  font-weight: 700;
}

.notif-item-date {
  font-size: 0.74rem;
  color: var(--text-s);
}

.notif-config-btn {
  margin-top: 0.6rem;
  width: 100%;
  border: 1px solid var(--accent-border);
  border-radius: 10px;
  background: transparent;
  color: var(--text-h);
  padding: 0.5rem 0.7rem;
  font-weight: 600;
  cursor: pointer;
}

.notif-config-btn:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
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
  gap: 0.45rem;
}

.avatar-container {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  flex-shrink: 0;
}

.nav-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.8rem;
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
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

@media (max-width: 768px) {
  .nav-content {
    padding: 0.65rem 0.75rem;
  }

  .logo-text {
    font-size: 1.2rem;
  }

  .main-nav {
    gap: 0.45rem;
  }

  .secrets-nav-link {
    padding: 0.38rem 0.55rem;
    font-size: 0.78rem;
  }

  .login-btn {
    padding: 0.45rem 0.8rem;
    font-size: 0.82rem;
  }

  .user-menu {
    max-width: 56vw;
    padding: 0.2rem 0.4rem 0.2rem 0.25rem;
  }

  .notif-label {
    display: none;
  }

  .notif-popover {
    position: fixed;
    top: calc(var(--header-height, 64px) + 0.5rem);
    left: 0.6rem;
    right: 0.6rem;
    width: auto;
    max-width: none;
    max-height: min(70vh, 520px);
    overflow-y: auto;
  }

  .avatar-placeholder {
    width: 28px;
    height: 28px;
    font-size: 0.72rem;
  }

  .user-name {
    font-size: 0.82rem;
    max-width: 34vw;
  }

  .theme-toggle {
    width: 32px;
    height: 32px;
    font-size: 1rem;
  }

  .theme-label {
    display: none;
  }

  .theme-wrapper {
    padding: 0;
  }
}
</style>


