import { createRouter, createWebHistory } from 'vue-router'
const HomeView = () => import('@/views/HomeView.vue')
import { useAuthStore } from '@/stores/authStore'
import { isAdminUser, isStaffUser } from '@/utils/roles'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) {
      return {
        el: to.hash,
        top: 8,
        behavior: 'smooth'
      }
    }
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/todo',
      name: 'home-todo',
      component: HomeView,
    },
    {
      path: '/noticia',
      name: 'home-news',
      component: HomeView,
    },
    {
      path: '/c',
      name: 'home-community',
      component: HomeView,
    },
    {
      path: '/encuestas',
      name: 'home-surveys',
      component: HomeView,
    },
    {
      path: '/loteria',
      name: 'home-lottery',
      component: HomeView,
    },
    {
      path: '/noticia/:ref/:slug?',
      name: 'news-detail',
      component: HomeView,
    },
    {
      path: '/c/:ref/:slug?',
      name: 'community-detail',
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
      path: '/notificaciones',
      name: 'notifications',
      meta: { requiresAuth: true },
      component: () => import('@/views/NotificationsView.vue'),
    },
    {
      path: '/config',
      name: 'config',
      meta: { requiresAuth: true },
      component: () => import('@/views/ConfigView.vue'),
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
    {
      path: '/usuarios/gestion',
      name: 'users-manager',
      meta: { requiresAdmin: true },
      component: () => import('@/views/UsersManagerView.vue'),
    },
  ],
})

const setMetaTag = (name: string, content: string, property = false) => {
  const selector = property
    ? `meta[property="${name}"]`
    : `meta[name="${name}"]`;
  let tag = document.querySelector(selector) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement('meta');
    if (property) tag.setAttribute('property', name);
    else tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const needsAuthCheck = Boolean(
    to.meta.requiresAuth || to.meta.requiresStaff || to.meta.requiresAdmin
  )

  if (needsAuthCheck) {
    // Solo bloqueamos navegación cuando realmente es una ruta protegida.
    await authStore.initAuthListener()
  } else if (!authStore.isInitialized) {
    // En rutas públicas no frenamos el render inicial.
    void authStore.initAuthListener()
  }

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

router.afterEach((to) => {
  const defaultTitle = 'Cdelu.ar - Noticias y Comunidad';
  const titleByRoute: Record<string, string> = {
    home: defaultTitle,
    'news-detail': 'Noticia - Cdelu.ar',
    'community-detail': 'Publicacion - Cdelu.ar',
    login: 'Iniciar Sesion - Cdelu.ar',
    'profile-self': 'Mi Perfil - Cdelu.ar',
    'profile-public': 'Perfil - Cdelu.ar',
    notifications: 'Notificaciones - Cdelu.ar',
    config: 'Configuracion - Cdelu.ar',
    privacy: 'Politica de Privacidad - Cdelu.ar',
    terms: 'Terminos y Condiciones - Cdelu.ar'
  };

  const routeName = typeof to.name === 'string' ? to.name : '';
  const nextTitle = titleByRoute[routeName] || defaultTitle;
  document.title = nextTitle;

  const canonicalPath = to.fullPath.startsWith('/') ? to.fullPath : `/${to.fullPath}`;
  const canonicalUrl = `https://cdelu.ar${canonicalPath}`;
  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', canonicalUrl);

  setMetaTag('description', 'Noticias y comunidad en tiempo real de Concepcion del Uruguay.');
  setMetaTag('og:title', nextTitle, true);
  setMetaTag('og:url', canonicalUrl, true);
  setMetaTag('twitter:title', nextTitle);
});

export default router
