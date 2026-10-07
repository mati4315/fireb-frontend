<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHeaderScroll } from '@/composables/useHeaderScroll';
import {
  useSecretStore,
  type SecretCategory,
  type SecretRecord,
  type SecretSex
} from '@/stores/secretStore';
import { useModuleStore, type HomeTabKey } from '@/stores/moduleStore';
import { useSurveyStore } from '@/stores/surveyStore';
import SecretCard from '@/components/feed/SecretCard.vue';

type SecretFilterKey = 'recentes' | 'populares' | 'polemicos';

const route = useRoute();
const router = useRouter();
const secretStore = useSecretStore();
const moduleStore = useModuleStore();
const surveyStore = useSurveyStore();

const { isVisible: isHeaderVisible } = useHeaderScroll();
const scrollY = ref(0);
const feedTabsRef = ref<HTMLElement | null>(null);
const SECRETOS_SCROLL_KEY = 'cdelu_secretos_scroll_y_v1';

const handleScrollY = () => {
  scrollY.value = window.scrollY;
};

const tabPathByKey: Record<HomeTabKey, string> = {
  todo: '/todo',
  news: '/noticia',
  post: '/c',
  secrets: '/secretos',
  surveys: '/encuestas',
  lottery: '/loteria'
};

const tabKeyByRouteName: Record<string, HomeTabKey> = {
  home: 'todo',
  'home-todo': 'todo',
  'home-news': 'news',
  'home-community': 'post',
  'secrets-home': 'secrets',
  'secrets-detail': 'secrets',
  'home-surveys': 'surveys',
  'home-lottery': 'lottery'
};

const visibleTabs = computed(() => {
  const shouldShowSurveysTab = 
    moduleStore.isModuleEnabled('surveys') && 
    (surveyStore.featuredLoading || Boolean(surveyStore.featuredSurvey));

  return moduleStore.availableTabs.filter(
    (tab) => tab.key !== 'surveys' || shouldShowSurveysTab
  );
});
const activeTabKey = computed<HomeTabKey>(() => {
  const routeName = typeof route.name === 'string' ? route.name : '';
  return tabKeyByRouteName[routeName] || 'secrets';
});

const setActiveTab = async (tabKey: HomeTabKey) => {
  const targetPath = tabPathByKey[tabKey] || '/';
  if (route.path !== targetPath) {
    saveSecretosScrollPosition();
    await router.push(targetPath);
  }
};

const scrollActiveTabIntoView = (behavior: ScrollBehavior = 'smooth') => {
  const tabsEl = feedTabsRef.value;
  if (!tabsEl) return;

  const activeTabEl = tabsEl.querySelector<HTMLElement>(
    `.tab-btn[data-tab-key="${activeTabKey.value}"]`
  );
  if (!activeTabEl) return;

  activeTabEl.scrollIntoView({
    behavior,
    block: 'nearest',
    inline: 'center'
  });
};

const saveSecretosScrollPosition = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SECRETOS_SCROLL_KEY, String(window.scrollY || 0));
  } catch {
    // no-op
  }
};

const restoreSecretosScrollPosition = async () => {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(SECRETOS_SCROLL_KEY) || '';
    const nextY = Number(raw);
    if (!Number.isFinite(nextY) || nextY < 0) return;
    await nextTick();
    requestAnimationFrame(() => {
      window.scrollTo({ top: nextY, behavior: 'instant' as ScrollBehavior });
    });
  } catch {
    // no-op
  }
};

const touchStartX = ref(0);
const touchStartY = ref(0);
const touchStartTime = ref(0);

const handleTouchStart = (e: TouchEvent) => {
  touchStartX.value = e.touches[0].clientX;
  touchStartY.value = e.touches[0].clientY;
  touchStartTime.value = Date.now();
};

const handleTouchEnd = (e: TouchEvent) => {
  const deltaX = e.changedTouches[0].clientX - touchStartX.value;
  const deltaY = e.changedTouches[0].clientY - touchStartY.value;
  const deltaTime = Date.now() - touchStartTime.value;

  const minSwipeDistance = 50;
  const maxVerticalDistance = 100;
  const maxTime = 300;

  if (Math.abs(deltaX) > minSwipeDistance && 
      Math.abs(deltaY) < maxVerticalDistance && 
      deltaTime < maxTime) {
    
    const tabs = visibleTabs.value;
    const currentIndex = tabs.findIndex(t => t.key === activeTabKey.value);
    
    if (deltaX < 0 && currentIndex < tabs.length - 1) {
      // Swipe left -> Next tab
      void setActiveTab(tabs[currentIndex + 1].key);
    } else if (deltaX > 0 && currentIndex > 0) {
      // Swipe right -> Previous tab
      void setActiveTab(tabs[currentIndex - 1].key);
    }
  }
};

const selectedFilter = ref<SecretFilterKey>('recentes');
const selectedZone = ref<string>('all');
const selectedSex = ref<SecretSex | 'all'>('all');
const selectedCategory = ref<string>('all');
const showHighlights = ref(false);
const hasActiveSecretFilters = computed(() =>
  selectedZone.value !== 'all' || selectedSex.value !== 'all' || selectedCategory.value !== 'all'
);

const clearSecretFilters = () => {
  selectedZone.value = 'all';
  selectedSex.value = 'all';
  selectedCategory.value = 'all';
};

const newSecretText = ref('');
const newSecretSex = ref<SecretSex>('no_responder');
const newSecretCategory = ref<SecretCategory>('');
const newSecretAge = ref<string>('');
const newSecretZone = ref('');
const createError = ref<string | null>(null);
const creating = ref(false);
const showExtraFields = ref(false);

const secretCategoryOptions: Array<{ value: SecretCategory; label: string }> = [
  { value: '', label: 'Sin categoria' },
  { value: 'rumores', label: 'Rumores' },
  { value: 'relaciones', label: 'Relaciones' },
  { value: 'trabajo_negocios', label: 'Trabajo / negocios' },
  { value: 'denuncia_light', label: 'Denuncias light' },
  { value: 'random_divertido', label: 'Random / divertido' }
];
const filterCategoryOptions = secretCategoryOptions.filter((option) => option.value);

const secretSexOptions: Array<{ value: SecretSex; label: string }> = [
  { value: 'no_responder', label: 'No responder' },
  { value: 'hombre', label: 'Hombre' },
  { value: 'mujer', label: 'Mujer' }
];

const detailSecretId = computed(() =>
  typeof route.params.ref === 'string' ? route.params.ref.trim() : ''
);

const toMillis = (value: any): number => {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
};

const ageHours = (secret: SecretRecord): number => {
  const ms = toMillis(secret.createdAt);
  if (!ms) return 0;
  return Math.max(0, (Date.now() - ms) / (60 * 60 * 1000));
};

const popularityScore = (secret: SecretRecord): number => {
  if (Number.isFinite(Number(secret.rank.hotScore))) {
    return Number(secret.rank.hotScore);
  }
  const totalVotes = secret.stats.totalVotesCount || (secret.stats.upVotesCount + secret.stats.downVotesCount);
  return secret.stats.upVotesCount - secret.stats.downVotesCount + Math.log10(Math.max(1, totalVotes + 1));
};

const polemicScore = (secret: SecretRecord): number => {
  if (Number.isFinite(Number(secret.rank.controversyScore))) {
    return Number(secret.rank.controversyScore);
  }
  return Math.min(secret.stats.upVotesCount, secret.stats.downVotesCount);
};

const visibleSecrets = computed(() => [...secretStore.secrets]);
const polemicOrderById = computed(() => {
  const order = new Map<string, number>();
  for (const [index, item] of secretStore.rankings.mostPolemic.entries()) {
    order.set(item.secretId, index);
  }
  return order;
});

const zoneOptions = computed(() => {
  const zones = new Set<string>();
  for (const secret of visibleSecrets.value) {
    if (secret.zone) zones.add(secret.zone);
  }
  return Array.from(zones).sort((a, b) => a.localeCompare(b, 'es'));
});

const filteredSecrets = computed(() => {
  let items = [...visibleSecrets.value];

  if (selectedZone.value !== 'all') {
    items = items.filter((secret) => secret.zone === selectedZone.value);
  }

  if (selectedSex.value !== 'all') {
    items = items.filter((secret) => secret.sex === selectedSex.value);
  }

  if (selectedCategory.value !== 'all') {
    items = items.filter((secret) => secret.category === selectedCategory.value);
  }

  if (selectedFilter.value === 'populares') {
    items.sort((a, b) => popularityScore(b) - popularityScore(a) || toMillis(b.createdAt) - toMillis(a.createdAt));
  } else if (selectedFilter.value === 'polemicos') {
    const order = polemicOrderById.value;
    if (order.size > 0) {
      items.sort((a, b) => {
        const aOrder = order.get(a.id);
        const bOrder = order.get(b.id);
        if (aOrder != null && bOrder != null) return aOrder - bOrder;
        if (aOrder != null) return -1;
        if (bOrder != null) return 1;
        return polemicScore(b) - polemicScore(a) || toMillis(b.createdAt) - toMillis(a.createdAt);
      });
    } else {
      items.sort((a, b) => polemicScore(b) - polemicScore(a) || toMillis(b.createdAt) - toMillis(a.createdAt));
    }
  } else {
    items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }

  if (!detailSecretId.value) return items;
  const detail = items.find((secret) => secret.id === detailSecretId.value);
  if (!detail) return items;
  return [detail, ...items.filter((secret) => secret.id !== detailSecretId.value)];
});

const secretsLast24h = computed(() =>
  visibleSecrets.value.filter((secret) => ageHours(secret) <= 24)
);

const topDayHighlights = computed(() =>
  [...secretsLast24h.value].sort((a, b) => popularityScore(b) - popularityScore(a)).slice(0, 3)
);

const mostCommentedHighlights = computed(() =>
  [...visibleSecrets.value]
    .sort((a, b) => b.stats.commentsCount - a.stats.commentsCount)
    .slice(0, 3)
);

const mostVotedHighlights = computed(() =>
  [...visibleSecrets.value]
    .sort(
      (a, b) =>
        (b.stats.totalVotesCount || (b.stats.upVotesCount + b.stats.downVotesCount)) -
        (a.stats.totalVotesCount || (a.stats.upVotesCount + a.stats.downVotesCount))
    )
    .slice(0, 3)
);

const rankingTopDay = computed(() => secretStore.rankings.topDay.slice(0, 3));
const rankingMostCommented = computed(() => secretStore.rankings.mostCommented.slice(0, 3));
const rankingMostVoted = computed(() => secretStore.rankings.mostVoted.slice(0, 3));
const secretMinTextLength = computed(() => secretStore.settings.minTextLength);
const secretMaxTextLength = computed(() => secretStore.settings.maxTextLength);
const warningThreshold = computed(() => Math.max(secretMaxTextLength.value - 20, secretMinTextLength.value));

const canCreateSecret = computed(() => {
  const text = newSecretText.value.trim();
  return text.length >= secretMinTextLength.value && text.length <= secretMaxTextLength.value;
});
const hasSecretDraftText = computed(() => newSecretText.value.trim().length > 0);

const textCount = computed(() => newSecretText.value.length);

const formatRelativeTime = (value: any): string => {
  const ms = toMillis(value);
  if (!ms) return 'hace un momento';
  const diff = Math.max(0, Date.now() - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(ms).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const rankingsGeneratedLabel = computed(() => {
  if (!secretStore.rankings.generatedAtMs) return 'pendiente';
  return formatRelativeTime(secretStore.rankings.generatedAtMs);
});

const slugify = (value: string): string => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'secreto';
};

const openSecretDetailById = async (secretId: string, textPreview = '') => {
  saveSecretosScrollPosition();
  const loaded = await secretStore.loadSecretById(secretId);
  const sourceText = loaded?.descripcion || textPreview || 'secreto';
  const slug = slugify(sourceText.slice(0, 64));
  await router.push(`/s/${encodeURIComponent(secretId)}/${encodeURIComponent(slug)}#secret-${secretId}`);
};

const openSecretDetail = async (secret: SecretRecord) =>
  openSecretDetailById(secret.id, secret.descripcion);

const handleCreateSecret = async () => {
  const text = newSecretText.value.trim();
  createError.value = null;

  if (text.length < secretMinTextLength.value) {
    createError.value = `El secreto debe tener al menos ${secretMinTextLength.value} caracteres.`;
    return;
  }
  if (text.length > secretMaxTextLength.value) {
    createError.value = `El secreto no puede superar ${secretMaxTextLength.value} caracteres.`;
    return;
  }
  if (!/[0-9A-Za-z\u00C0-\u024F]/.test(text)) {
    createError.value = 'Escribe un texto real, no solo emojis.';
    return;
  }

  creating.value = true;
  try {
    await secretStore.createSecret({
      text,
      sex: newSecretSex.value,
      age: newSecretAge.value ? Number(newSecretAge.value) : null,
      category: newSecretCategory.value,
      zone: String(newSecretZone.value || '').trim()
    });
    newSecretText.value = '';
    newSecretSex.value = 'no_responder';
    newSecretCategory.value = '';
    newSecretAge.value = '';
    newSecretZone.value = '';
    createError.value = null;
  } catch (err: any) {
    createError.value = err?.message || 'No se pudo publicar el secreto.';
  } finally {
    creating.value = false;
  }
};

onMounted(() => {
  scrollY.value = window.scrollY;
  window.addEventListener('scroll', handleScrollY, { passive: true });
  moduleStore.initModulesListener();
  if (!detailSecretId.value) {
    void restoreSecretosScrollPosition();
  }
  void nextTick(() => {
    scrollActiveTabIntoView('auto');
  });
});

watch(
  () => moduleStore.modules.secrets.enabled,
  (enabled) => {
    if (enabled) {
      secretStore.initSecretsListener();
      secretStore.initSettingsListener();
      return;
    }
    secretStore.cleanup();
  },
  { immediate: true }
);

watch(showHighlights, (visible) => {
  if (visible) void secretStore.initRankingsListener();
});

watch(
  () => [activeTabKey.value, visibleTabs.value.map((tab) => tab.key).join('|')],
  async () => {
    await nextTick();
    scrollActiveTabIntoView('smooth');
  }
);

watch(
  detailSecretId,
  async (secretId, prevSecretId) => {
    if (prevSecretId && !secretId) {
      await restoreSecretosScrollPosition();
    }
    if (!secretId) return;
    await secretStore.loadSecretById(secretId);
  },
  { immediate: true }
);

onUnmounted(() => {
  saveSecretosScrollPosition();
  window.removeEventListener('scroll', handleScrollY);
  secretStore.cleanup();
});
</script>

<template>
  <div 
    class="secretos-view"
    @touchstart="handleTouchStart"
    @touchend="handleTouchEnd"
  >
    <div
      ref="feedTabsRef"
      class="feed-tabs"
      :class="{
        'tabs-at-top': scrollY <= 64,
        'tabs-fixed-top': !isHeaderVisible && scrollY > 64,
        'tabs-hidden-up': isHeaderVisible && scrollY > 64
      }"
    >
      <button
        v-for="tab in visibleTabs"
        :key="tab.key"
        class="tab-btn"
        :data-tab-key="tab.key"
        :class="{ active: activeTabKey === tab.key }"
        @click="setActiveTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>



    


    <section v-if="moduleStore.modules.secrets.enabled" class="composer-card">



        




            <div 
              class="composer-grid"
              :class="{
                'is-male': newSecretSex === 'hombre',
                'is-female': newSecretSex === 'mujer',
                'is-neutral': newSecretSex === 'no_responder'
              }"
            >
        <label>
          Soy
          <select v-model="newSecretSex">
            <option
              v-for="option in secretSexOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <label>
          y tengo
          <input
            v-model="newSecretAge"
            type="number"
            min="17"
            max="99"
            inputmode="numeric"
             placeholder="Ej: 24"
          /> 
        
        </label>

        <button
          type="button"
          class="toggle-extras-btn"
          @click="showExtraFields = !showExtraFields"
        >
          {{ showExtraFields ? '− Menos' : '+ Opcional' }}
        </button>

        <Transition name="fade-slide">
          <div v-if="showExtraFields" class="extras-group">
            <label>
              <select v-model="newSecretCategory">
                <option
                  v-for="option in secretCategoryOptions"
                  :key="option.value || 'none'"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label>
              <input
                v-model="newSecretZone"
                type="text"
                maxlength="48"
                placeholder="Zona (ej: centro)"
              />
            </label>
          </div>
        </Transition>
      </div>

      
      
        
      <header>
        <p class="microcopy">No publiques nombres ni insultos. Describe un hecho, no acuses directamente.</p>
      </header>

      <textarea
        v-model="newSecretText"
        class="secret-textarea"
        placeholder="Comparte algo anonimo y real..."
        :maxlength="secretMaxTextLength"
      />


      
 
    


      <div 
        class="composer-footer"
        :class="{
          'is-male': newSecretSex === 'hombre',
          'is-female': newSecretSex === 'mujer',
          'is-neutral': newSecretSex === 'no_responder'
        }"
      >
        <span class="counter" :class="{ warn: textCount > warningThreshold }">{{ textCount }}/{{ secretMaxTextLength }}</span>
        <button
          class="publish-btn"
          :class="{ 'has-text': hasSecretDraftText }"
          type="button"
          :disabled="creating || !canCreateSecret"
          @click="handleCreateSecret"
        >
          {{ creating ? 'Publicando...' : 'Publicar secreto' }}
        </button>
      </div>
    </section>

    <section v-if="moduleStore.modules.secrets.enabled" class="filters">
      <div class="filters-heading">
        <div class="filters-heading-main">
          <div class="filters-eyebrow">
            <svg class="eyebrow-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>EL MURO ANÓNIMO</span>
          </div>
          <h2 class="filters-title">Explora los secretos</h2>
        </div>

        <div class="filters-heading-side">
          <span class="results-count">
            <strong class="count-num">{{ filteredSecrets.length }}</strong>
            <span class="count-label">{{ filteredSecrets.length === 1 ? 'secreto' : 'secretos' }}</span>
          </span>
          <button
            class="toggle-highlights-btn"
            type="button"
            :class="{ active: showHighlights }"
            :aria-expanded="showHighlights"
            @click="showHighlights = !showHighlights"
          >
            <svg class="star-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <span>{{ showHighlights ? 'Ocultar destacados' : 'Destacados' }}</span>
          </button>
        </div>
      </div>

      <div class="filter-top">
        <div class="filter-group">
          <span class="filter-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>
            </svg>
            Ordenar por
          </span>
          <div class="filter-segmented" role="group" aria-label="Orden de los secretos">
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: selectedFilter === 'recentes' }"
              :aria-pressed="selectedFilter === 'recentes'"
              @click="selectedFilter = 'recentes'"
            >
              <svg class="seg-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>Recientes</span>
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: selectedFilter === 'populares' }"
              :aria-pressed="selectedFilter === 'populares'"
              @click="selectedFilter = 'populares'"
            >
              <svg class="seg-icon fire" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 23c-4.97 0-9-3.92-9-8.75 0-3.8 2.5-6.62 4.54-8.91.73-.82 1.46-1.63 2.13-2.52.48-.64 1.15-.99 1.9-.99s1.42.35 1.9.99c.67.89 1.4 1.7 2.13 2.52C17.5 7.63 20 10.45 20 14.25c0 4.83-4.03 8.75-9 8.75z"/>
              </svg>
              <span>Populares</span>
            </button>
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: selectedFilter === 'polemicos' }"
              :aria-pressed="selectedFilter === 'polemicos'"
              @click="selectedFilter = 'polemicos'"
            >
              <svg class="seg-icon zap" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <span>Polémicos</span>
            </button>
          </div>
        </div>

        <div class="filter-group demographic-group">
          <span class="filter-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Publicado por
          </span>
          <div class="filter-segmented" role="group" aria-label="Filtrar por género">
            <button
              type="button"
              class="segmented-btn"
              :class="{ active: selectedSex === 'all' }"
              :aria-pressed="selectedSex === 'all'"
              @click="selectedSex = 'all'"
            >
              <span>Todos</span>
            </button>
            <button
              type="button"
              class="segmented-btn male"
              :class="{ active: selectedSex === 'hombre' }"
              :aria-pressed="selectedSex === 'hombre'"
              @click="selectedSex = 'hombre'"
            >
              <span class="sex-dot male"></span>
              <span>Hombres</span>
            </button>
            <button
              type="button"
              class="segmented-btn female"
              :class="{ active: selectedSex === 'mujer' }"
              :aria-pressed="selectedSex === 'mujer'"
              @click="selectedSex = 'mujer'"
            >
              <span class="sex-dot female"></span>
              <span>Mujeres</span>
            </button>
          </div>
        </div>
      </div>

      <div class="filter-actions-bar">
        <div class="filter-chips">
          <div class="filter-select-pill" :class="{ 'has-value': selectedCategory !== 'all' }">
            <svg class="pill-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
            </svg>
            <span class="pill-title">Categoría:</span>
            <select v-model="selectedCategory" aria-label="Filtrar por categoría">
              <option value="all">Todas</option>
              <option
                v-for="category in filterCategoryOptions"
                :key="category.value"
                :value="category.value"
              >
                {{ category.label }}
              </option>
            </select>
            <svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          <div class="filter-select-pill" :class="{ 'has-value': selectedZone !== 'all' }">
            <svg class="pill-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <span class="pill-title">Zona:</span>
            <select v-model="selectedZone" aria-label="Filtrar por zona">
              <option value="all">Todas</option>
              <option v-for="zone in zoneOptions" :key="zone" :value="zone">{{ zone }}</option>
            </select>
            <svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        <button
          v-if="hasActiveSecretFilters"
          class="clear-filters-btn"
          type="button"
          @click="clearSecretFilters"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          <span>Limpiar filtros</span>
        </button>
      </div>

      <div v-show="showHighlights" class="highlights-wrapper">
        <div class="highlights">
          <div class="highlight-card">
            <h3>Top secretos del dia</h3>
            <p class="highlight-meta">
              Ranking {{ rankingsGeneratedLabel }}<span v-if="secretStore.rankingsLoading"> (actualizando)</span>
            </p>
            <ul>
              <li v-for="item in rankingTopDay" :key="`top-ranked-${item.secretId}`">
                <button type="button" @click="openSecretDetailById(item.secretId, item.textPreview)">
                  {{ item.textPreview || 'Secreto anonimo' }}
                </button>
              </li>
              <template v-if="rankingTopDay.length === 0">
                <li v-for="item in topDayHighlights" :key="`top-fallback-${item.id}`">
                  <button type="button" @click="openSecretDetail(item)">
                    {{ item.descripcion.slice(0, 88) }}{{ item.descripcion.length > 88 ? '...' : '' }}
                  </button>
                </li>
                <li v-if="topDayHighlights.length === 0" class="empty">Sin secretos en las ultimas 24h.</li>
              </template>
            </ul>
          </div>

          <div class="highlight-card">
            <h3>Mas comentados</h3>
            <ul>
              <li v-for="item in rankingMostCommented" :key="`comments-ranked-${item.secretId}`">
                <button type="button" @click="openSecretDetailById(item.secretId, item.textPreview)">
                  {{ item.commentsCount }} comentarios
                </button>
              </li>
              <template v-if="rankingMostCommented.length === 0">
                <li v-for="item in mostCommentedHighlights" :key="`comments-fallback-${item.id}`">
                  <button type="button" @click="openSecretDetail(item)">
                    {{ item.stats.commentsCount }} comentarios
                  </button>
                </li>
                <li v-if="mostCommentedHighlights.length === 0" class="empty">Sin datos todavia.</li>
              </template>
            </ul>
          </div>

          <div class="highlight-card">
            <h3>Mas votados</h3>
            <ul>
              <li v-for="item in rankingMostVoted" :key="`votes-ranked-${item.secretId}`">
                <button type="button" @click="openSecretDetailById(item.secretId, item.textPreview)">
                  {{ item.totalVotesCount }} votos
                </button>
              </li>
              <template v-if="rankingMostVoted.length === 0">
                <li v-for="item in mostVotedHighlights" :key="`votes-fallback-${item.id}`">
                  <button type="button" @click="openSecretDetail(item)">
                    {{ item.stats.totalVotesCount || (item.stats.upVotesCount + item.stats.downVotesCount) }} votos
                  </button>
                </li>
                <li v-if="mostVotedHighlights.length === 0" class="empty">Sin datos todavia.</li>
              </template>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section v-if="moduleStore.modules.secrets.enabled" class="feed">
      <div v-if="secretStore.loading" class="state-card">Cargando secretos...</div>
      <div v-else-if="filteredSecrets.length === 0" class="state-card">
        Todavia no hay secretos en este filtro.
      </div>

      <SecretCard
        v-for="secret in filteredSecrets"
        :key="secret.id"
        :secret="secret"
      />

      <button
        v-if="secretStore.hasMoreSecrets && !secretStore.loading"
        class="load-more-secrets"
        type="button"
        :disabled="secretStore.loadingMoreSecrets"
        @click="secretStore.loadMoreSecrets()"
      >
        {{ secretStore.loadingMoreSecrets ? 'Cargando secretos…' : 'Cargar más secretos' }}
      </button>
    </section>

    <section v-else class="state-card">
      El modulo de secretos esta deshabilitado.
    </section>
  </div>
</template>

<style scoped>
.secretos-view {
  max-width: 880px;
  margin: 0 auto;
  padding: 1.2rem 0.95rem 2.5rem;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.feed-tabs {
  display: flex;
  gap: 1.5rem;
  border-bottom: 1px solid var(--border);
  padding: 0 1.5rem;
  z-index: 999;
  background: var(--glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  height: var(--header-height);
  align-items: center;
  overflow-x: auto;
  flex-wrap: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  margin-bottom: 1.5rem;
  transition: transform 0.2s ease, opacity 0.2s ease;
  scroll-padding-inline: 1.5rem;
}

.feed-tabs::after {
  content: '';
  flex: 0 0 1.5rem;
  height: 1px;
}

.tabs-at-top {
  position: relative;
  transform: none;
  opacity: 1;
}

.tabs-fixed-top {
  position: sticky;
  top: 0;
  transform: translateY(0);
  opacity: 1;
}

.tabs-hidden-up {
  position: sticky;
  top: 0;
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
}

.feed-tabs::-webkit-scrollbar {
  display: none;
}

.tab-btn {
  white-space: nowrap;
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 0.45rem 0.25rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  position: relative;
  transition: color 0.2s ease;
}

.tab-btn:hover {
  color: var(--accent);
}

.tab-btn.active {
  color: var(--accent);
}

.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: -0.6rem;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--accent);
  border-radius: 3px 3px 0 0;
}




.composer-card {
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 18px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  min-width: 0;
  width: 100%;
}

.composer-card h2 {
  margin: 0;
  color: var(--text-h);
  font-size: 1.1rem;
}

.microcopy {
  margin: 0.3rem 0 0;
  color: var(--text);
  font-size: 0.9rem;
}

.secret-textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  color: var(--text-h);
  padding: 0.8rem;
  min-height: 95px;
  resize: vertical;
  font: inherit;
}

.composer-grid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.7rem;
  transition: all 0.4s ease;
  border-radius: 12px;
  padding: 0.2rem;
}

.composer-grid.is-male,
.composer-grid.is-female,
.composer-grid.is-neutral {
  margin: -1rem -1rem 1.2rem;
  border-radius: 17px 17px 0 0;
  border: none;
  border-bottom: 1px solid rgba(0,0,0,0.1);
  padding: 1rem;
  color: #fff;
}

.composer-grid.is-male {
  background: #1e5fad;
}

.composer-grid.is-female {
  background: #ca2a6e;
}

.composer-grid.is-neutral {
  background: linear-gradient(135deg, #0ea5a8 0%, #0891b2 100%);
}

.composer-grid label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}

.composer-grid.is-male label,
.composer-grid.is-female label,
.composer-grid.is-neutral label {
  color: #fff;
}

.composer-grid.is-male .toggle-extras-btn,
.composer-grid.is-female .toggle-extras-btn,
.composer-grid.is-neutral .toggle-extras-btn {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.12);
}

.composer-grid.is-male .toggle-extras-btn:hover,
.composer-grid.is-female .toggle-extras-btn:hover,
.composer-grid.is-neutral .toggle-extras-btn:hover {
  background: rgba(255, 255, 255, 0.22);
  border-color: #fff;
}

.composer-grid input,
.composer-grid select {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-h);
  padding: 0.45rem 0.55rem;
  font-size: 0.9rem;
}

.composer-grid.is-male input,
.composer-grid.is-female input,
.composer-grid.is-neutral input,
.composer-grid.is-male select,
.composer-grid.is-female select,
.composer-grid.is-neutral select {
  color: #ffffff !important;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.45);
  font-weight: 700;
}

.composer-grid.is-male input:focus,
.composer-grid.is-female input:focus,
.composer-grid.is-neutral input:focus,
.composer-grid.is-male select:focus,
.composer-grid.is-female select:focus,
.composer-grid.is-neutral select:focus {
  background: rgba(255, 255, 255, 0.3);
  border-color: #ffffff;
  outline: none;
}

.composer-grid select option {
  background: var(--card-bg);
  color: var(--text-h);
  font-weight: 600;
}

.toggle-extras-btn {
  background: none;
  border: 1px dashed var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  transition: all 0.2s;
  height: fit-content;
  align-self: center;
}

.toggle-extras-btn:hover {
  background: var(--bg);
  border-color: var(--accent);
  color: var(--accent);
}

.extras-group {
  display: flex;
  gap: 0.7rem;
  align-items: center;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.composer-grid input::placeholder,
.composer-grid select::placeholder,
.field-hint {
  color: var(--text);
  opacity: 0.65;
  font-size: 0.8rem;
  font-weight: 500;
}

.composer-grid.is-male input::placeholder,
.composer-grid.is-female input::placeholder,
.composer-grid.is-neutral input::placeholder {
  color: rgba(255, 255, 255, 0.75);
}
.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.4s ease;
  border-radius: 12px;
}

.composer-footer.is-male,
.composer-footer.is-female,
.composer-footer.is-neutral {
  margin: 1.2rem -1rem -1rem -1rem;
  border-radius: 0 0 17px 17px;
  border: none;
  border-top: 1px solid rgba(0,0,0,0.1);
  padding: 1rem;
  color: #fff;
}

.composer-footer.is-male {
  background: #1e5fad;
}

.composer-footer.is-female {
  background: #ca2a6e;
}

.composer-footer.is-neutral {
  background: linear-gradient(135deg, #0ea5a8 0%, #0891b2 100%);
}

.counter {
  color: inherit;
  font-size: 0.92rem;
  font-weight: 800;
}

.counter.warn {
  color: #c2410c;
}

.publish-btn {
  border: 0;
  border-radius: 99px;
  background: var(--accent);
  color: #fff;
  font-weight: 800;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.composer-footer.is-male .publish-btn,
.composer-footer.is-female .publish-btn,
.composer-footer.is-neutral .publish-btn {
  background: var(--accent);
  color: #fff;
}

.composer-footer.is-male .publish-btn:hover,
.composer-footer.is-female .publish-btn:hover,
.composer-footer.is-neutral .publish-btn:hover {
  opacity: 0.9;
}

.publish-btn.has-text {
  opacity: 0.9;
}

.publish-btn:disabled {
  opacity: 0.6;
  cursor: default;
  transform: none;
  box-shadow: none;
}

.highlights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
}

@media (max-width: 767px) {
  .highlights {
    grid-template-columns: minmax(0, 1fr);
  }
}

.highlight-card {
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 14px;
  padding: 0.8rem;
}

.highlight-card h3 {
  margin: 0 0 0.5rem;
  font-size: 0.92rem;
  color: var(--text-h);
}

.highlight-meta {
  margin: -0.2rem 0 0.55rem;
  color: var(--text);
  font-size: 0.75rem;
}

.highlight-card ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
}

.highlight-card button {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  padding: 0.42rem 0.5rem;
  text-align: left;
  cursor: pointer;
  font-size: 0.8rem;
}

.highlight-card .empty {
  font-size: 0.8rem;
  color: var(--text);
}

.filters {
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 16px;
  padding: 1.1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
}

.filters-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.filters-heading-main {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.filters-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  color: var(--accent);
  font-size: 0.67rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.eyebrow-icon {
  opacity: 0.85;
}

.filters-title {
  margin: 0;
  color: var(--text-h);
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.2;
}

.filters-heading-side {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.results-count {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 7%, var(--bg));
  color: var(--text);
  padding: 0.32rem 0.68rem;
  font-size: 0.76rem;
}

.count-num {
  color: var(--accent);
  font-weight: 800;
}

.count-label {
  font-weight: 600;
}

.toggle-highlights-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  color: var(--text-h);
  font-weight: 700;
  font-size: 0.77rem;
  padding: 0.32rem 0.75rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.toggle-highlights-btn .star-icon {
  color: #f59e0b;
  transition: transform 0.2s ease;
}

.toggle-highlights-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--bg));
}

.toggle-highlights-btn:hover .star-icon {
  transform: rotate(18deg) scale(1.1);
}

.toggle-highlights-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.toggle-highlights-btn.active .star-icon {
  color: #fff;
}

.filter-top {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 0.9rem 1.1rem;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.filter-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text);
  font-size: 0.73rem;
  font-weight: 750;
  letter-spacing: 0.02em;
}

.filter-segmented {
  display: flex;
  background: color-mix(in srgb, var(--text) 7%, var(--bg));
  padding: 3px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  gap: 2px;
  width: 100%;
  box-sizing: border-box;
}

.segmented-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--text);
  font-weight: 600;
  font-size: 0.78rem;
  min-height: 36px;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.18s cubic-bezier(0.2, 0, 0, 1);
}

.segmented-btn:hover {
  color: var(--text-h);
  background: color-mix(in srgb, var(--card-bg) 60%, transparent);
}

.segmented-btn.active {
  background: var(--card-bg);
  color: var(--accent);
  font-weight: 750;
  border-color: color-mix(in srgb, var(--accent) 22%, var(--border));
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
}

.segmented-btn.male.active {
  color: #2563eb;
  border-color: color-mix(in srgb, #2563eb 25%, var(--border));
}

.segmented-btn.female.active {
  color: #db2777;
  border-color: color-mix(in srgb, #db2777 25%, var(--border));
}

.seg-icon {
  flex-shrink: 0;
  opacity: 0.75;
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.segmented-btn.active .seg-icon {
  opacity: 1;
  transform: scale(1.1);
}

.seg-icon.fire {
  color: #f97316;
}

.seg-icon.zap {
  color: #eab308;
}

.sex-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.sex-dot.male {
  background: #3b82f6;
}

.sex-dot.female {
  background: #ec4899;
}

.filter-actions-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-top: 0.85rem;
  border-top: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
}

.filter-chips {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.filter-select-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  padding: 0.3rem 1.8rem 0.3rem 0.65rem;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text-h);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 34px;
  box-sizing: border-box;
}

.filter-select-pill:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 5%, var(--bg));
}

.filter-select-pill.has-value {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  color: var(--accent);
}

.filter-select-pill select {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  outline: none;
  margin: 0;
  padding: 0;
}

.pill-icon {
  color: var(--text);
  opacity: 0.75;
  flex-shrink: 0;
}

.filter-select-pill.has-value .pill-icon {
  color: var(--accent);
  opacity: 1;
}

.pill-title {
  color: var(--text);
  font-size: 0.73rem;
  font-weight: 500;
}

.filter-select-pill.has-value .pill-title {
  color: var(--accent);
  font-weight: 600;
}

.chevron-icon {
  position: absolute;
  right: 0.55rem;
  pointer-events: none;
  opacity: 0.6;
  color: inherit;
}

.clear-filters-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444;
  border-radius: 999px;
  padding: 0.34rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 34px;
}

.clear-filters-btn:hover {
  background: #ef4444;
  color: #fff;
}

.filter-select-pill select:focus-visible,
.segmented-btn:focus-visible,
.toggle-highlights-btn:focus-visible,
.clear-filters-btn:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 2px;
}

.highlights-wrapper {
  margin-top: 0.2rem;
  padding-top: 0.85rem;
  border-top: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
}

.feed {
  display: grid;
  gap: 0.85rem;
}

.load-more-secrets {
  justify-self: center;
  min-height: 44px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 8%, var(--card-bg));
  color: var(--text-h);
  padding: 0.65rem 1.2rem;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
}

.load-more-secrets:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 15%, var(--card-bg));
}

.load-more-secrets:disabled {
  cursor: wait;
  opacity: 0.7;
}

.state-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--card-bg);
  color: var(--text);
  padding: 1rem;
  text-align: center;
  font-weight: 600;
}

.secret-card {
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.secret-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.9rem;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  gap: 0.5rem;
}

.secret-card-header.is-male {
  background: #1e5fad; /* Azul masculino */
}

.secret-card-header.is-female {
  background: #ca2a6e; /* Rosa femenino */
}

.secret-card-header:not(.is-male):not(.is-female) {
  background: var(--bg-hover);
  color: var(--text-h);
  border-bottom: 1px solid var(--border);
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.header-center {
  flex: 1;
  text-align: center;
}

.gender-icon {
  width: 1.15rem;
  height: 1.15rem;
}

.header-age {
  font-size: 0.95rem;
}

.header-id {
  opacity: 0.85;
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.header-stat {
  font-size: 0.88rem;
  margin-right: 0.2rem;
}

.header-emojis {
  display: flex;
  gap: 0.35rem;
  font-size: 1.1rem;
}

.secret-card-body {
  padding: 0.9rem;
  display: grid;
  gap: 0.6rem;
}

.card-meta-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: -0.1rem;
}

.alias {
  color: var(--text-h);
  font-weight: 700;
  font-size: 0.85rem;
}

.dot,
.time {
  color: var(--text);
  font-size: 0.78rem;
}

.trend.down {
  color: #b91c1c;
  border-color: #fecaca;
  background: #fff1f2;
}

.secret-text {
  margin: 0;
  color: var(--text-h);
  line-height: 1.5;
  white-space: pre-wrap;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.22rem 0.5rem;
  font-size: 0.74rem;
  color: var(--text);
  background: var(--bg);
}

.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
  transition: all 0.4s ease;
}

.actions.is-male,
.actions.is-female {
  margin: 1rem -0.9rem -0.9rem -0.9rem;
  padding: 0.8rem 0.9rem;
  border: none;
  border-top: 1px solid rgba(0,0,0,0.1);
  border-radius: 0 0 16px 16px;
}

.actions.is-male {
  background: #1e5fad;
  color: #fff;
}

.actions.is-female {
  background: #ca2a6e;
  color: #fff;
}

/* Ajuste de botones cuando están dentro de una barra de color sólida */
.actions.is-male .vote-btn,
.actions.is-male .comment-btn,
.actions.is-male .open-btn,
.actions.is-male .report-btn,
.actions.is-female .vote-btn,
.actions.is-female .comment-btn,
.actions.is-female .open-btn,
.actions.is-female .report-btn {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.actions.is-male .vote-btn:hover,
.actions.is-male .comment-btn:hover,
.actions.is-male .open-btn:hover,
.actions.is-female .vote-btn:hover,
.actions.is-female .comment-btn:hover,
.actions.is-female .open-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

.actions.is-male .vote-btn.active,
.actions.is-female .vote-btn.active {
  background: #91c010;
  color: var(--text-h);
  border-color: #fff;
}

.vote-btn,
.comment-btn,
.open-btn,
.report-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  color: var(--text-h);
  font-weight: 700;
  font-size: 0.8rem;
  padding: 0.4rem 0.68rem;
  cursor: pointer;
}

.btn-icon {
  width: 1.1rem;
  height: 1.1rem;
}

.vote-btn.active {
  border-color: var(--accent-border);
  color: var(--accent);
}

.report-btn {
  margin-left: auto;
}

.report-state {
  margin: 0;
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 600;
}

.comments-box {
  border-top: 1px solid var(--border);
  padding-top: 0.65rem;
  display: grid;
  gap: 0.55rem;
}

.comment-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.5rem;
}

.comment-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  padding: 0.5rem 0.58rem;
}

.comment-meta {
  margin: 0;
  color: var(--text);
  font-size: 0.76rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.comment-text {
  margin: 0.35rem 0 0;
  color: var(--text-h);
  font-size: 0.86rem;
  white-space: pre-wrap;
}

.comment-form {
  display: grid;
  gap: 0.45rem;
}

.comment-form textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-h);
  padding: 0.55rem;
  min-height: 68px;
  resize: vertical;
  font: inherit;
}

.comment-form button {
  justify-self: end;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-weight: 800;
  padding: 0.48rem 0.85rem;
  cursor: pointer;
}

.comment-form button:disabled {
  opacity: 0.6;
  cursor: default;
}

.comment-state {
  color: var(--text);
  font-size: 0.84rem;
}

.form-error {
  margin: 0;
  color: #b93535;
  font-size: 1rem;
  font-weight: 700;
}

@media (max-width: 860px) {
  .highlights {
    grid-template-columns: 1fr;
  }

  .filters {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 640px) {
  .filters {
    padding: 0.95rem 0.85rem;
    gap: 0.85rem;
    border-radius: 14px;
    margin: 0 0.4rem;
  }

  .filter-top {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
  }

  .filters-heading {
    gap: 0.6rem;
  }

  .filters-heading-side {
    width: 100%;
    justify-content: space-between;
  }

  .filter-actions-bar {
    gap: 0.5rem;
    padding-top: 0.75rem;
  }

  .filter-chips {
    width: 100%;
    gap: 0.45rem;
  }

  .filter-select-pill {
    flex: 1 1 calc(50% - 0.25rem);
    min-width: 125px;
    justify-content: space-between;
  }

  .clear-filters-btn {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 640px) {
  .secretos-view {
    padding: 1rem 0;
  }

  .feed-tabs {
    padding: 0 1rem;
    gap: 1.25rem;
    scroll-padding-inline: 1rem;
  }

  .composer-card {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    margin-bottom: 0.5rem;
  }

  .composer-grid {
    gap: 0.5rem;
  }

  .composer-grid.is-male,
  .composer-grid.is-female,
  .composer-grid.is-neutral {
    border-radius: 0;
  }

  .composer-footer.is-male,
  .composer-footer.is-female,
  .composer-footer.is-neutral {
    border-radius: 0;
  }

  .highlights {
    padding: 0 1rem;
  }

  .state-card {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
  }
}

@media (max-width: 560px) {
  .report-btn {
    margin-left: 0;
  }
}
</style>

