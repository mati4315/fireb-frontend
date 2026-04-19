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

type SecretFilterKey = 'recentes' | 'populares' | 'polemicos';

const route = useRoute();
const router = useRouter();
const secretStore = useSecretStore();
const moduleStore = useModuleStore();
const { isVisible: isHeaderVisible } = useHeaderScroll();
const scrollY = ref(0);
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

const visibleTabs = computed(() => moduleStore.availableTabs);
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

const selectedFilter = ref<SecretFilterKey>('recentes');
const selectedZone = ref<string>('all');

const newSecretText = ref('');
const newSecretSex = ref<SecretSex>('no_responder');
const newSecretCategory = ref<SecretCategory>('');
const newSecretAge = ref<string>('');
const newSecretZone = ref('');
const createError = ref<string | null>(null);
const creating = ref(false);

const openCommentsBySecret = ref<Record<string, boolean>>({});
const commentInputBySecret = ref<Record<string, string>>({});
const commentErrorBySecret = ref<Record<string, string | null>>({});
const reportStatusBySecret = ref<Record<string, string | null>>({});

const secretCategoryOptions: Array<{ value: SecretCategory; label: string }> = [
  { value: '', label: 'Sin categoria' },
  { value: 'rumores', label: 'Rumores' },
  { value: 'relaciones', label: 'Relaciones' },
  { value: 'trabajo_negocios', label: 'Trabajo / negocios' },
  { value: 'denuncia_light', label: 'Denuncias light' },
  { value: 'random_divertido', label: 'Random / divertido' }
];

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

const canCreateSecret = computed(() => {
  const text = newSecretText.value.trim();
  return text.length >= 12 && text.length <= 280;
});

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
  await router.push(`/s/${encodeURIComponent(secretId)}/${encodeURIComponent(slug)}`);
};

const openSecretDetail = async (secret: SecretRecord) =>
  openSecretDetailById(secret.id, secret.descripcion);

const backToSecrets = async () => {
  await router.push('/secretos');
};

const resolveCategoryLabel = (value: string): string => {
  const found = secretCategoryOptions.find((item) => item.value === value);
  return found?.label || value;
};

const resolveTrendLabel = (trend: string): string => {
  if (trend === 'up') return 'Subiendo';
  if (trend === 'down') return 'Bajando';
  return 'Estable';
};

const handleCreateSecret = async () => {
  const text = newSecretText.value.trim();
  createError.value = null;

  if (text.length < 12) {
    createError.value = 'El secreto debe tener al menos 12 caracteres.';
    return;
  }
  if (text.length > 280) {
    createError.value = 'El secreto no puede superar 280 caracteres.';
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
      age: newSecretAge.value.trim() ? Number(newSecretAge.value.trim()) : null,
      category: newSecretCategory.value,
      zone: newSecretZone.value.trim()
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

const handleVote = async (secretId: string, vote: 1 | -1) => {
  try {
    await secretStore.voteSecret(secretId, vote);
  } catch (err) {
    console.error('Error voting secret:', err);
  }
};

const handleReport = async (secretId: string) => {
  reportStatusBySecret.value = {
    ...reportStatusBySecret.value,
    [secretId]: null
  };
  try {
    await secretStore.reportSecret(secretId, 'contenido_inapropiado');
    reportStatusBySecret.value = {
      ...reportStatusBySecret.value,
      [secretId]: 'Reporte enviado'
    };
  } catch (err: any) {
    reportStatusBySecret.value = {
      ...reportStatusBySecret.value,
      [secretId]: err?.message || 'No se pudo reportar'
    };
  }
};

const toggleComments = async (secretId: string) => {
  const isOpen = Boolean(openCommentsBySecret.value[secretId]);
  openCommentsBySecret.value = {
    ...openCommentsBySecret.value,
    [secretId]: !isOpen
  };
  if (!isOpen) {
    await secretStore.loadComments(secretId);
  }
};

const handleCreateComment = async (secretId: string) => {
  const comment = (commentInputBySecret.value[secretId] || '').trim();
  if (!comment) {
    commentErrorBySecret.value = {
      ...commentErrorBySecret.value,
      [secretId]: 'Escribe un comentario.'
    };
    return;
  }
  if (!/[0-9A-Za-z\u00C0-\u024F]/.test(comment)) {
    commentErrorBySecret.value = {
      ...commentErrorBySecret.value,
      [secretId]: 'Escribe un comentario valido.'
    };
    return;
  }

  commentErrorBySecret.value = {
    ...commentErrorBySecret.value,
    [secretId]: null
  };

  try {
    await secretStore.createComment(secretId, comment);
    commentInputBySecret.value = {
      ...commentInputBySecret.value,
      [secretId]: ''
    };
  } catch (err: any) {
    commentErrorBySecret.value = {
      ...commentErrorBySecret.value,
      [secretId]: err?.message || 'No se pudo comentar.'
    };
  }
};

const setCommentDraft = (secretId: string, text: string) => {
  commentInputBySecret.value = {
    ...commentInputBySecret.value,
    [secretId]: text
  };
};

onMounted(() => {
  scrollY.value = window.scrollY;
  window.addEventListener('scroll', handleScrollY, { passive: true });
  moduleStore.initModulesListener();
  if (!detailSecretId.value) {
    void restoreSecretosScrollPosition();
  }
});

watch(
  () => moduleStore.modules.secrets.enabled,
  (enabled) => {
    if (enabled) {
      secretStore.initSecretsListener();
      secretStore.initRankingsListener();
      return;
    }
    secretStore.cleanup();
  },
  { immediate: true }
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
  <div class="secretos-view">
    <div
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
        :class="{ active: activeTabKey === tab.key }"
        @click="setActiveTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <section class="hero">
      <div class="hero-text">
        <h1>Secretos</h1>
        <p>Comparte algo anonimo y real. Sin perfiles, sin filtro, con respeto.</p>
      </div>
      <button
        v-if="detailSecretId"
        class="ghost-btn"
        type="button"
        @click="backToSecrets"
      >
        Volver al feed
      </button>
    </section>

    <section v-if="moduleStore.modules.secrets.enabled" class="composer-card">
      <header>
        <h2>Crear secreto</h2>
        <p class="microcopy">No publiques nombres ni insultos. Describe un hecho, no acuses directamente.</p>
      </header>

      <textarea
        v-model="newSecretText"
        class="secret-textarea"
        placeholder="Comparte algo anonimo y real..."
        maxlength="280"
      />

      <div class="composer-grid">
        <label>
          Sexo
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
          Categoria (opcional)
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
          Edad (opcional)
          <input
            v-model="newSecretAge"
            type="number"
            min="13"
            max="99"
            inputmode="numeric"
            placeholder="Ej: 24"
          />
        </label>

        <label>
          Zona (opcional)
          <input
            v-model="newSecretZone"
            type="text"
            maxlength="48"
            placeholder="Ej: Centro"
          />
        </label>
      </div>

      <div class="composer-footer">
        <span class="counter" :class="{ warn: textCount > 260 }">{{ textCount }}/280</span>
        <button
          class="publish-btn"
          type="button"
          :disabled="creating || !canCreateSecret"
          @click="handleCreateSecret"
        >
          {{ creating ? 'Publicando...' : 'Publicar secreto' }}
        </button>
      </div>

      <p v-if="createError" class="form-error">{{ createError }}</p>
    </section>

    <section v-if="moduleStore.modules.secrets.enabled" class="highlights">
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
            <li v-if="mostVotedHighlights.length === 0" class="empty">Sin votos todavia.</li>
          </template>
        </ul>
      </div>
    </section>

    <section v-if="moduleStore.modules.secrets.enabled" class="filters">
      <div class="filter-tabs">
        <button
          type="button"
          class="filter-btn"
          :class="{ active: selectedFilter === 'recentes' }"
          @click="selectedFilter = 'recentes'"
        >
          Recientes
        </button>
        <button
          type="button"
          class="filter-btn"
          :class="{ active: selectedFilter === 'populares' }"
          @click="selectedFilter = 'populares'"
        >
          Populares
        </button>
        <button
          type="button"
          class="filter-btn"
          :class="{ active: selectedFilter === 'polemicos' }"
          @click="selectedFilter = 'polemicos'"
        >
          Sin resolver / polemicos
        </button>
      </div>

      <label class="zone-filter">
        Zona:
        <select v-model="selectedZone">
          <option value="all">Todas</option>
          <option v-for="zone in zoneOptions" :key="zone" :value="zone">{{ zone }}</option>
        </select>
      </label>
    </section>

    <section v-if="moduleStore.modules.secrets.enabled" class="feed">
      <div v-if="secretStore.loading" class="state-card">Cargando secretos...</div>
      <div v-else-if="filteredSecrets.length === 0" class="state-card">
        Todavia no hay secretos en este filtro.
      </div>

      <article
        v-for="secret in filteredSecrets"
        :key="secret.id"
        class="secret-card"
      >
        <header class="secret-card-header">
          <div class="meta-left">
            <span class="alias">{{ secret.anonAlias || 'Anonimo' }}</span>
            <span class="dot">|</span>
            <span class="time">{{ formatRelativeTime(secret.createdAt) }}</span>
          </div>
          <div class="meta-right">
            <span class="trend" :class="secret.rank.trend">{{ resolveTrendLabel(secret.rank.trend) }}</span>
          </div>
        </header>

        <p class="secret-text">{{ secret.descripcion }}</p>

        <div class="chips">
          <span v-if="secret.category" class="chip">{{ resolveCategoryLabel(secret.category) }}</span>
          <span v-if="secret.zone" class="chip">{{ secret.zone }}</span>
        </div>

        <footer class="actions">
          <button
            class="vote-btn"
            :class="{ active: secret.myVote === 1 }"
            type="button"
            :disabled="secretStore.isVotingPending(secret.id)"
            @click="handleVote(secret.id, 1)"
          >
            + {{ secret.stats.upVotesCount }}
          </button>
          <button
            class="vote-btn"
            :class="{ active: secret.myVote === -1 }"
            type="button"
            :disabled="secretStore.isVotingPending(secret.id)"
            @click="handleVote(secret.id, -1)"
          >
            - {{ secret.stats.downVotesCount }}
          </button>
          <button class="comment-btn" type="button" @click="toggleComments(secret.id)">
            Comentarios {{ secret.stats.commentsCount }}
          </button>
          <button class="open-btn" type="button" @click="openSecretDetail(secret)">
            Abrir
          </button>
          <button
            class="report-btn"
            type="button"
            :disabled="secretStore.isReportPending(secret.id) || secret.reportedByMe"
            @click="handleReport(secret.id)"
          >
            {{ secret.reportedByMe ? 'Reportado' : 'Reportar' }}
          </button>
        </footer>

        <p v-if="reportStatusBySecret[secret.id]" class="report-state">
          {{ reportStatusBySecret[secret.id] }}
        </p>

        <section v-if="openCommentsBySecret[secret.id]" class="comments-box">
          <div v-if="secretStore.isCommentsLoading(secret.id)" class="comment-state">
            Cargando comentarios...
          </div>
          <ul v-else class="comment-list">
            <li
              v-for="comment in secretStore.getComments(secret.id)"
              :key="comment.id"
              class="comment-item"
            >
              <p class="comment-meta">
                <strong>{{ comment.anonAlias || 'Anonimo' }}</strong>
                <span>| {{ formatRelativeTime(comment.createdAt) }}</span>
              </p>
              <p class="comment-text">{{ comment.text }}</p>
            </li>
            <li v-if="secretStore.getComments(secret.id).length === 0" class="comment-state">
              Sin comentarios todavia.
            </li>
          </ul>

          <div class="comment-form">
            <textarea
              :value="commentInputBySecret[secret.id] || ''"
              placeholder="Escribe un comentario anonimo..."
              maxlength="300"
              @input="setCommentDraft(secret.id, ($event.target as HTMLTextAreaElement).value)"
            />
            <button
              type="button"
              :disabled="secretStore.isCommentCreating(secret.id)"
              @click="handleCreateComment(secret.id)"
            >
              {{ secretStore.isCommentCreating(secret.id) ? 'Enviando...' : 'Comentar' }}
            </button>
          </div>
          <p v-if="commentErrorBySecret[secret.id]" class="form-error">
            {{ commentErrorBySecret[secret.id] }}
          </p>
        </section>
      </article>
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
  display: grid;
  gap: 1rem;
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

.hero {
  border: 1px solid var(--border);
  background: linear-gradient(130deg, color-mix(in srgb, var(--accent) 14%, var(--card-bg)) 0%, var(--card-bg) 70%);
  border-radius: 18px;
  padding: 1rem 1.1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}

.hero h1 {
  margin: 0;
  font-size: clamp(1.35rem, 2.4vw, 2rem);
  color: var(--text-h);
}

.hero p {
  margin: 0.35rem 0 0;
  color: var(--text);
  max-width: 620px;
}

.ghost-btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.composer-card {
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 18px;
  padding: 1rem;
  display: grid;
  gap: 0.8rem;
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
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 0.55rem;
}

.composer-grid label {
  display: grid;
  gap: 0.35rem;
  color: var(--text-h);
  font-size: 0.85rem;
  font-weight: 600;
}

.composer-grid input,
.composer-grid select {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-h);
  padding: 0.48rem 0.58rem;
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.counter {
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 700;
}

.counter.warn {
  color: #c2410c;
}

.publish-btn {
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-weight: 800;
  padding: 0.6rem 1rem;
  cursor: pointer;
}

.publish-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.highlights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
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
  border-radius: 14px;
  padding: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
}

.filter-tabs {
  display: flex;
  gap: 0.45rem;
}

.filter-btn {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  color: var(--text-h);
  font-weight: 700;
  font-size: 0.84rem;
  padding: 0.45rem 0.72rem;
  cursor: pointer;
}

.filter-btn.active {
  border-color: var(--accent-border);
  background: color-mix(in srgb, var(--accent) 14%, var(--bg));
  color: var(--accent);
}

.zone-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--text-h);
  font-size: 0.85rem;
  font-weight: 700;
}

.zone-filter select {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-h);
  padding: 0.35rem 0.5rem;
}

.feed {
  display: grid;
  gap: 0.85rem;
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
  padding: 0.9rem;
  display: grid;
  gap: 0.65rem;
}

.secret-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
}

.meta-left {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.alias {
  color: var(--text-h);
  font-weight: 800;
  font-size: 0.88rem;
}

.dot,
.time {
  color: var(--text);
  font-size: 0.8rem;
}

.trend {
  border-radius: 999px;
  padding: 0.24rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 800;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
}

.trend.up {
  color: #0f766e;
  border-color: #99f6e4;
  background: #f0fdfa;
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
}

.vote-btn,
.comment-btn,
.open-btn,
.report-btn {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  color: var(--text-h);
  font-weight: 700;
  font-size: 0.8rem;
  padding: 0.4rem 0.68rem;
  cursor: pointer;
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
  color: #b91c1c;
  font-size: 0.82rem;
  font-weight: 700;
}

@media (max-width: 860px) {
  .highlights {
    grid-template-columns: 1fr;
  }

  .composer-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filters {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 560px) {
  .secretos-view {
    padding: 0.9rem 0.55rem 1.6rem;
  }

  .hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .composer-grid {
    grid-template-columns: 1fr;
  }

  .report-btn {
    margin-left: 0;
  }
}
</style>

