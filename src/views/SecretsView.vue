<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  useSecretStore,
  type SecretCategory,
  type SecretRecord,
  type SecretSex
} from '@/stores/secretStore';
import { useModuleStore } from '@/stores/moduleStore';
import SecretCard from '@/components/feed/SecretCard.vue';

type SecretFilterKey = 'recentes' | 'populares' | 'polemicos';

const route = useRoute();
const router = useRouter();
const secretStore = useSecretStore();
const moduleStore = useModuleStore();
const SECRETOS_SCROLL_KEY = 'cdelu_secretos_scroll_y_v1';
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
const selectedSex = ref<SecretSex | 'all'>('all');
const showHighlights = ref(false);

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
      secretStore.initSettingsListener();
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

onBeforeUnmount(() => {
  secretStore.cleanup();
});
</script>

<template>
  <div class="secretos-view">
    <section v-if="moduleStore.modules.secrets.enabled" class="composer-card">
      <div 
        class="composer-grid"
        :class="{
          'is-male': newSecretSex === 'hombre',
          'is-female': newSecretSex === 'mujer'
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
          'is-female': newSecretSex === 'mujer'
        }"
      >
        <span class="counter" :class="{ warn: textCount > warningThreshold }">{{ textCount }}/{{ secretMaxTextLength }}</span>
        <button
          class="publish-btn"
          type="button"
          :disabled="creating || !canCreateSecret"
          @click="handleCreateSecret"
        >
          {{ creating ? 'Publicando...' : 'Publicar secreto' }}
        </button>
      </div>

    </section>
    <section v-if="moduleStore.modules.secrets.enabled" class="filters">
      <div class="filter-top">
        <div class="filter-group">
          <div class="filter-tabs scroll-x">
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
              class="filter-btn male"
              :class="{ active: selectedSex === 'hombre' }"
              @click="selectedSex = 'hombre'"
            >
              Hombres
            </button>
            <button
              type="button"
              class="filter-btn female"
              :class="{ active: selectedSex === 'mujer' }"
              @click="selectedSex = 'mujer'"
            >
              Mujeres
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
              Polemicos
            </button>
          </div>

          <div class="filter-tabs scroll-x">
            <button
              type="button"
              class="filter-btn"
              :class="{ active: selectedSex === 'all' }"
              @click="selectedSex = 'all'"
            >
              Todos
            </button>
          </div>

          <div class="filter-actions">
            <label class="zone-filter">
              Zona:
              <select v-model="selectedZone">
                <option value="all">Todas</option>
                <option v-for="zone in zoneOptions" :key="zone" :value="zone">{{ zone }}</option>
              </select>
            </label>
            <button class="toggle-highlights-btn" @click="showHighlights = !showHighlights">
              {{ showHighlights ? 'Ocultar destacados' : 'Ver destacados 🌟' }}
            </button>
          </div>
        </div>
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.7rem;
  transition: all 0.4s ease;
  border-radius: 12px;
  padding: 0.2rem;
}

.composer-grid.is-male,
.composer-grid.is-female {
  margin: -1rem -1rem 1.2rem;
  border-radius: 17px 17px 0 0;
  border: none;
  border-bottom: 1px solid rgba(0,0,0,0.1);
  padding: 1rem;
}

.composer-grid.is-male {
  background: color-mix(in srgb, #4680dd 62%, var(--card-bg));
  border-bottom-color: color-mix(in srgb, #4680dd 30%, var(--border));
}

.composer-grid.is-female {
  background: color-mix(in srgb, #ca2a6e 62%, var(--card-bg));
  border-bottom-color: color-mix(in srgb, #ca2a6e 30%, var(--border));
}

.composer-grid label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--text-h);
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
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
.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.4s ease;
  border-radius: 12px;
}

.composer-footer.is-male,
.composer-footer.is-female {
  margin: 1.2rem -1rem -1rem -1rem;
  border-radius: 0 0 17px 17px;
  border: none;
  border-top: 1px solid rgba(0,0,0,0.1);
  padding: 1rem;
}

.composer-footer.is-male {
  background: color-mix(in srgb, #4680dd 62%, var(--card-bg));
  border-top-color: color-mix(in srgb, #4680dd 30%, var(--border));
}

.composer-footer.is-female {
  background: color-mix(in srgb, #ca2a6e 62%, var(--card-bg));
  border-top-color: color-mix(in srgb, #ca2a6e 30%, var(--border));
}

.counter {
  color: var(--text);
  font-size: 0.92rem;
  font-weight: 800;
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
  border-radius: 14px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.filter-top {
  display: flex;
  flex-direction: row;
  gap: 0.65rem;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

@media (min-width: 768px) {
  .filter-top {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.toggle-highlights-btn {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  color: var(--text-h);
  font-weight: 700;
  font-size: 0.82rem;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
}

.toggle-highlights-btn:hover {
  background: var(--bg-hover);
}

.highlights-wrapper {
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--border);
}
.filter-group {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
}

.filter-tabs {
  display: flex;
  gap: 0.45rem;
  width: 100%;
  min-width: 0;
  flex-wrap: nowrap;
}

.scroll-x {
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.scroll-x::-webkit-scrollbar {
  display: none;
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
  flex-shrink: 0;
  white-space: nowrap;
}

.filter-btn.active {
  border-color: var(--accent-border);
  background: color-mix(in srgb, var(--accent) 14%, var(--bg));
  color: var(--accent);
}

.filter-btn.male.active {
  border-color: #1e5fad;
  background: color-mix(in srgb, #1e5fad 14%, var(--bg));
  color: #1e5fad;
}

.filter-btn.female.active {
  border-color: #ca2a6e;
  background: color-mix(in srgb, #ca2a6e 14%, var(--bg));
  color: #ca2a6e;
}

.zone-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--text-h);
  font-size: 0.85rem;
  font-weight: 700;
  flex-shrink: 0;
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
</style>
