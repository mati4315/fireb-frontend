import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/stores/authStore'
import { isAdminUser, isStaffUser } from '@/utils/roles'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/perfil',
      name: 'profile-self',
      meta: { requiresAuth: true },
      component: () => import('@/views/ProfileView.vue'),
    },
    {
      path: '/perfil/:username',
      name: 'profile-public',
      component: () => import('@/views/ProfileView.vue'),
    },
    {
      path: '/privacidad',
      name: 'privacy',
      component: () => import('@/views/PrivacyView.vue'),
    },
    {
      path: '/terminos',
      name: 'terms',
      component: () => import('@/views/TermsView.vue'),
    },
    {
      path: '/ads',
      name: 'ads-manager',
      meta: { requiresStaff: true },
      component: () => import('@/views/AdsManagerView.vue'),
    },
    {
      path: '/encuestas/gestion',
      name: 'surveys-manager',
      meta: { requiresStaff: true },
      component: () => import('@/views/SurveysManagerView.vue'),
    },
    {
      path: '/loteria/gestion',
      name: 'lottery-manager',
      meta: { requiresStaff: true },
      component: () => import('@/views/LotteryManagerView.vue'),
    },
    {
      path: '/comentarios/gestion',
      name: 'comments-manager',
      meta: { requiresAdmin: true },
      component: () => import('@/views/CommentsManagerView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login' }
  }

  const rol = authStore.userProfile?.rol
  const email = authStore.user?.email || authStore.userProfile?.email
  const uid = authStore.user?.uid
  const isStaff = authStore.isAuthenticated && isStaffUser(
    rol,
    email,
    uid,
    authStore.tokenClaims
  )
  const isAdmin = authStore.isAuthenticated && isAdminUser(
    rol,
    email,
    uid,
    authStore.tokenClaims
  )

  if (to.meta.requiresAdmin) {
    if (isAdmin) return true
    return { name: 'home' }
  }

  if (!to.meta.requiresStaff) return true

  if (isStaff) return true
  return { name: 'home' }
})

export default router
