import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/stores/authStore'
import { isStaffUser } from '@/utils/roles'

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
  ],
})

router.beforeEach((to) => {
  if (!to.meta.requiresStaff) return true

  const authStore = useAuthStore()
  const rol = authStore.userProfile?.rol
  const email = authStore.user?.email || authStore.userProfile?.email
  const uid = authStore.user?.uid
  const isStaff = authStore.isAuthenticated && isStaffUser(
    rol,
    email,
    uid,
    authStore.tokenClaims
  )

  if (isStaff) return true
  return { name: 'home' }
})

export default router
