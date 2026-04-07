import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

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
      component: () => import('@/views/AdsManagerView.vue'),
    },
  ],
})

export default router
