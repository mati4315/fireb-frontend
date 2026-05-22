<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import {
  useLotteryStore,
  type Lottery,
  type LotteryNumberCell,
  type LotteryNumberFilter
} from '@/stores/lotteryStore';
import AuthPromptModal from '@/components/common/AuthPromptModal.vue';
import LotteryCountdown from '@/components/lottery/LotteryCountdown.vue';

const authStore = useAuthStore();
const lotteryStore = useLotteryStore();

const expandedByLottery = ref<Record<string, boolean>>({});
const pageByLottery = ref<Record<string, number>>({});
const filterByLottery = ref<Record<string, LotteryNumberFilter>>({});
const errorByLottery = ref<Record<string, string>>({});
const successNumberByLottery = ref<Record<string, number>>({});
const showLoginPrompt = ref(false);
const modalLotteryId = ref<string | null>(null);
const modalCell = ref<LotteryNumberCell | null>(null);
const didAutoExpandFirstLottery = ref(false);
const availableTiltClassByKey = new Map<string, string>();
const availableBallClassByKey = new Map<string, string>();
const numbersTouchStartX = ref(0);
const numbersTouchStartY = ref(0);
const numbersTouchStartTime = ref(0);
const numbersSwipeDetected = ref(false);
const suppressOpenModalUntilByLottery = ref<Record<string, number>>({});

const AVAILABLE_TILT_CLASSES = [
  'tilt-neg8',
  'tilt-neg6',
  'tilt-neg4',
  'tilt-neg2',
  'tilt-0',
  'tilt-pos2',
  'tilt-pos4',
  'tilt-pos6',
  'tilt-pos8'
] as const;

const AVAILABLE_BALL_CLASSES = [
  'ball-yellow',
  'ball-blue',
  'ball-green',
  'ball-orange',
  'ball-red',
  'ball-purple',
  'ball-cyan',
  'ball-black',
  'ball-white'
] as const;

const successTimers = new Map<string, ReturnType<typeof setTimeout>>();

const lotteries = computed(() => lotteryStore.publicLotteries);
const loading = computed(() => lotteryStore.publicLoading);

const isExpanded = (lotteryId: string): boolean => Boolean(expandedByLottery.value[lotteryId]);

const getPage = (lotteryId: string): number => {
  return Math.max(1, Math.floor(pageByLottery.value[lotteryId] || 1));
};

const getFilter = (lotteryId: string): LotteryNumberFilter => {
  return filterByLottery.value[lotteryId] || 'all';
};

const getBounds = (lotteryId: string, page: number) => {
  return lotteryStore.getNumberPageBounds(lotteryId, page);
};

const setError = (lotteryId: string, message: string) => {
  errorByLottery.value = {
    ...errorByLottery.value,
    [lotteryId]: message
  };
};

const clearError = (lotteryId: string) => {
  if (!errorByLottery.value[lotteryId]) return;
  const next = { ...errorByLottery.value };
  delete next[lotteryId];
  errorByLottery.value = next;
};

const setSuccessNumber = (lotteryId: string, selectedNumber: number) => {
  successNumberByLottery.value = {
    ...successNumberByLottery.value,
    [lotteryId]: selectedNumber
  };

  const previous = successTimers.get(lotteryId);
  if (previous) {
    clearTimeout(previous);
  }

  const timer = setTimeout(() => {
    const next = { ...successNumberByLottery.value };
    delete next[lotteryId];
    successNumberByLottery.value = next;
    successTimers.delete(lotteryId);
  }, 1800);

  successTimers.set(lotteryId, timer);
};

const getStatusLabel = (lottery: Lottery): string => {
  if (lottery.status === 'active') return 'Activa';
  if (lottery.status === 'closed') return 'Cerrada';
  if (lottery.status === 'completed') return 'Finalizada';
  return 'Borrador';
};

const getStatusClass = (lottery: Lottery): string => {
  return `status-${lottery.status}`;
};

const formatDateTime = (value: Date | null): string => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(value);
};

const getAvailableCount = (lottery: Lottery): number => {
  return Math.max(0, lottery.maxNumber - lottery.participantsCount);
};

const getSoldProgressPercent = (lottery: Lottery): number => {
  if (lottery.maxNumber <= 0) return 0;
  const ratio = (lottery.participantsCount / lottery.maxNumber) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
};

const getUserTicketCount = (lotteryId: string): number => {
  return lotteryStore.getUserTicketsCount(lotteryId);
};

const getUserTicketLimit = (lottery: Lottery): number => {
  return lotteryStore.getEffectiveTicketLimit(
    lottery.id,
    lottery.maxTicketsPerUser,
    lottery.maxNumber
  );
};

const canBuyMoreNumbers = (lottery: Lottery): boolean => {
  return getUserTicketCount(lottery.id) < getUserTicketLimit(lottery);
};

const isLimitReached = (lottery: Lottery): boolean => {
  return !canBuyMoreNumbers(lottery);
};

const getUserNumbersLabel = (lotteryId: string): string => {
  const numbers = lotteryStore.getUserNumbers(lotteryId);
  if (numbers.length === 0) return 'Aún no seleccionaste ningún número';
  return numbers.join(', ');
};

const getNumberCells = (lotteryId: string): LotteryNumberCell[] => {
  return lotteryStore.getNumberCells(lotteryId, getPage(lotteryId), getFilter(lotteryId));
};

const ensurePageLoaded = async (lotteryId: string) => {
  const page = getPage(lotteryId);
  await lotteryStore.loadNumberPage(lotteryId, page);
};

const prefetchAllPages = async (lotteryId: string, currentPage: number) => {
  const bounds = getBounds(lotteryId, currentPage);
  const candidates: number[] = [];
  const minPage = Math.max(1, currentPage - 1);
  const maxPage = Math.min(bounds.totalPages, currentPage + 1);
  for (let page = minPage; page <= maxPage; page += 1) {
    if (page !== currentPage) candidates.push(page);
  }

  for (const page of candidates) {
    try {
      await lotteryStore.loadNumberPage(lotteryId, page);
    } catch {
      // Prefetch best-effort: no bloquea la UX principal.
    }
  }
};

const toggleExpanded = async (lotteryId: string) => {
  const next = !isExpanded(lotteryId);
  expandedByLottery.value = {
    ...expandedByLottery.value,
    [lotteryId]: next
  };

  if (!next) return;

  clearError(lotteryId);
  try {
    await ensurePageLoaded(lotteryId);
    void prefetchAllPages(lotteryId, getPage(lotteryId));
  } catch {
    setError(lotteryId, 'No se pudieron cargar los numeros de esta loteria.');
  }
};

const setPage = async (lottery: Lottery, requestedPage: number) => {
  const bounds = getBounds(lottery.id, requestedPage);
  pageByLottery.value = {
    ...pageByLottery.value,
    [lottery.id]: bounds.page
  };
  clearError(lottery.id);

  try {
    await lotteryStore.loadNumberPage(lottery.id, bounds.page);
    void prefetchAllPages(lottery.id, bounds.page);
  } catch {
    setError(lottery.id, 'No se pudo cargar la pagina solicitada.');
  }
};

const setFilter = async (lottery: Lottery, filter: LotteryNumberFilter) => {
  filterByLottery.value = {
    ...filterByLottery.value,
    [lottery.id]: filter
  };

  await setPage(lottery, 1);
};

const handleNumbersTouchStart = (e: TouchEvent) => {
  numbersTouchStartX.value = e.touches[0].clientX;
  numbersTouchStartY.value = e.touches[0].clientY;
  numbersTouchStartTime.value = Date.now();
  numbersSwipeDetected.value = false;
};

const handleNumbersTouchMove = (e: TouchEvent) => {
  const deltaX = e.touches[0].clientX - numbersTouchStartX.value;
  const deltaY = e.touches[0].clientY - numbersTouchStartY.value;
  if (Math.abs(deltaX) > 24 && Math.abs(deltaY) < 90) {
    numbersSwipeDetected.value = true;
  }
};

const handleNumbersTouchEnd = async (lottery: Lottery, e: TouchEvent) => {
  if (lotteryStore.isNumberPageLoading(lottery.id, getPage(lottery.id))) return;

  const deltaX = e.changedTouches[0].clientX - numbersTouchStartX.value;
  const deltaY = e.changedTouches[0].clientY - numbersTouchStartY.value;
  const deltaTime = Date.now() - numbersTouchStartTime.value;

  const minSwipeDistance = 40;
  const maxVerticalDistance = 90;
  const maxTime = 450;

  if (
    Math.abs(deltaX) > minSwipeDistance &&
    Math.abs(deltaY) < maxVerticalDistance &&
    deltaTime < maxTime
  ) {
    suppressOpenModalUntilByLottery.value = {
      ...suppressOpenModalUntilByLottery.value,
      [lottery.id]: Date.now() + 380
    };
    if (deltaX < 0) {
      await setPage(lottery, getPage(lottery.id) + 1);
    } else {
      await setPage(lottery, getPage(lottery.id) - 1);
    }
  }
};

const getCellClass = (lotteryId: string, cell: LotteryNumberCell): string[] => {
  const classes = ['number-btn', `state-${cell.state}`];
  if (cell.state === 'available') {
    const key = `${lotteryId}_${cell.number}`;
    const existingTiltClass = availableTiltClassByKey.get(key);
    const existingBallClass = availableBallClassByKey.get(key);
    if (existingTiltClass) {
      classes.push(existingTiltClass);
    } else {
      const randomIdx = Math.floor(Math.random() * AVAILABLE_TILT_CLASSES.length);
      const randomTiltClass = AVAILABLE_TILT_CLASSES[randomIdx];
      availableTiltClassByKey.set(key, randomTiltClass);
      classes.push(randomTiltClass);
    }
    if (existingBallClass) {
      classes.push(existingBallClass);
    } else {
      const randomIdx = Math.floor(Math.random() * AVAILABLE_BALL_CLASSES.length);
      const randomBallClass = AVAILABLE_BALL_CLASSES[randomIdx];
      availableBallClassByKey.set(key, randomBallClass);
      classes.push(randomBallClass);
    }
  }
  if (lotteryStore.isSelectingNumber(lotteryId, cell.number)) {
    classes.push('is-pending');
  }
  if (successNumberByLottery.value[lotteryId] === cell.number) {
    classes.push('just-bought');
  }
  return classes;
};

const openNumberModal = (lottery: Lottery, cell: LotteryNumberCell) => {
  const suppressUntil = suppressOpenModalUntilByLottery.value[lottery.id] || 0;
  if (numbersSwipeDetected.value || Date.now() < suppressUntil) return;

  clearError(lottery.id);

  if (cell.state === 'available' && !authStore.isAuthenticated) {
    showLoginPrompt.value = true;
    return;
  }

  modalLotteryId.value = lottery.id;
  modalCell.value = cell;
};

const closeNumberModal = () => {
  modalLotteryId.value = null;
  modalCell.value = null;
};

const modalLottery = computed(() => {
  if (!modalLotteryId.value) return null;
  return lotteryStore.getLotteryById(modalLotteryId.value);
});

const modalCanBuy = computed(() => {
  const lottery = modalLottery.value;
  const cell = modalCell.value;
  if (!lottery || !cell) return false;
  if (cell.state !== 'available') return false;
  if (!authStore.isAuthenticated) return false;
  if (!lotteryStore.isLotteryOpenForEntry(lottery)) return false;
  if (!canBuyMoreNumbers(lottery)) return false;
  if (lotteryStore.isSelectingNumber(lottery.id, cell.number)) return false;
  return true;
});

const modalLimitReached = computed(() => {
  const lottery = modalLottery.value;
  const cell = modalCell.value;
  if (!lottery || !cell) return false;
  if (cell.state !== 'available') return false;
  if (!authStore.isAuthenticated) return false;
  return isLimitReached(lottery);
});

const getFriendlyError = (error: any): string => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');

  if (code.includes('already-exists') || message.includes('number-taken')) {
    return 'Ese numero ya esta ocupado. Elige otro disponible.';
  }
  if (message.includes('limit-reached')) {
    return 'Ya alcanzaste el limite de numeros para esta loteria.';
  }
  if (message.includes('out-of-range')) {
    return 'El numero seleccionado esta fuera del rango permitido.';
  }
  if (message.includes('lottery-inactive')) {
    return 'Esta loteria no esta disponible para comprar numero.';
  }
  if (message.includes('module-disabled')) {
    return 'El modulo de loteria esta deshabilitado temporalmente.';
  }
  if (message.includes('migration-in-progress')) {
    return 'La loteria esta sincronizando entradas. Intenta nuevamente en unos segundos.';
  }
  if (message.includes('backend-outdated')) {
    return 'La funcion de compra esta desactualizada en el servidor. Hay que desplegar enterLottery V2.';
  }
  if (code.includes('permission-denied')) {
    return 'No tienes permisos para participar en esta loteria.';
  }
  if (code.includes('failed-precondition')) {
    return message || 'Esta loteria no esta disponible para comprar numero.';
  }
  return message || 'No se pudo completar la compra del numero.';
};

const buySelectedNumber = async () => {
  const lottery = modalLottery.value;
  const cell = modalCell.value;
  if (!lottery || !cell) return;

  clearError(lottery.id);
  try {
    await lotteryStore.selectLotteryNumber(lottery.id, cell.number);
    setSuccessNumber(lottery.id, cell.number);
    await lotteryStore.loadNumberPage(lottery.id, getPage(lottery.id), { force: true });
    void prefetchAllPages(lottery.id, getPage(lottery.id));
    closeNumberModal();
  } catch (error: any) {
    setError(lottery.id, getFriendlyError(error));
  }
};

const refreshVisiblePage = async (lottery: Lottery) => {
  clearError(lottery.id);
  try {
    await lotteryStore.loadNumberPage(lottery.id, getPage(lottery.id), { force: true });
    void prefetchAllPages(lottery.id, getPage(lottery.id));
  } catch {
    setError(lottery.id, 'No se pudo actualizar la pagina actual.');
  }
};

const closeLoginPrompt = () => {
  showLoginPrompt.value = false;
};

watch(
  lotteries,
  async (nextLotteries) => {
    if (didAutoExpandFirstLottery.value || nextLotteries.length === 0) return;

    const firstLottery = nextLotteries[0];
    expandedByLottery.value = { [firstLottery.id]: true };
    didAutoExpandFirstLottery.value = true;

    clearError(firstLottery.id);
    try {
      await ensurePageLoaded(firstLottery.id);
      void prefetchAllPages(firstLottery.id, getPage(firstLottery.id));
    } catch {
      setError(firstLottery.id, 'No se pudieron cargar los numeros de esta loteria.');
    }
  },
  { immediate: true }
);

onMounted(() => {
  lotteryStore.initPublicLotteriesListener();
  lotteryStore.initUserEntriesListener();
});

onBeforeUnmount(() => {
  lotteryStore.cleanupPublicLotteries();

  for (const timer of successTimers.values()) {
    clearTimeout(timer);
  }
  successTimers.clear();
});
</script>

<template>
  <section class="lottery-section">
    <div v-if="loading" class="lottery-loading">
      <div class="spinner"></div>
      <p>Cargando loterias...</p>
    </div>

    <div v-else-if="lotteries.length === 0" class="lottery-empty">
      <h3>No hay loterias disponibles</h3>
      <p>Cuando el staff publique una loteria, aparecera aqui.</p>
    </div>

    <div v-else class="lottery-list">
      <article
        v-for="lottery in lotteries"
        :key="lottery.id"
        class="lottery-card"
      >
        <div v-if="lottery.imageUrl" class="lottery-cover-wrap">
          <img
            :src="lottery.imageUrl"
            alt="Imagen de loteria"
            class="lottery-cover"
            loading="lazy"
          />
        </div>

        <header class="lottery-head">
          <div>
            <h3>{{ lottery.title }}</h3>
            <p v-if="lottery.description" class="lottery-description">{{ lottery.description }}</p>
          </div>
          <span :class="['lottery-status', getStatusClass(lottery)]">
            {{ getStatusLabel(lottery) }}
          </span>
        </header>

        <div class="lottery-meta">
          <span>Inicio: <strong>{{ formatDateTime(lottery.startsAt) }}</strong></span>
          <span>Cierre: <strong>{{ formatDateTime(lottery.endsAt) }}</strong></span>
          <span>Tus numeros: <strong>{{ getUserNumbersLabel(lottery.id) }}</strong></span>
        </div>

        <div class="lottery-progress">
          <div class="progress-top">
            <strong>{{ getSoldProgressPercent(lottery) }}%</strong>
            <span>{{ lottery.participantsCount }} participantes / {{ getAvailableCount(lottery) }} disponibles</span>
          </div>
          <div class="progress-track" role="progressbar" :aria-valuenow="getSoldProgressPercent(lottery)" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-fill" :style="{ width: `${getSoldProgressPercent(lottery)}%` }"></div>
          </div>
        </div>

        <div class="lottery-time">
          <span class="time-icon" aria-hidden="true">⏱</span>
          <span>Tiempo restante: <LotteryCountdown :ends-at="lottery.endsAt" :status="lottery.status" /></span>
        </div>

        <div v-if="isLimitReached(lottery)" class="lottery-limit-banner" role="status" aria-live="polite">
          <span class="limit-icon" aria-hidden="true">!</span>
          <span>Ya alcanzaste tu limite de {{ getUserTicketLimit(lottery) }} numeros para esta loteria.</span>
        </div>

        <div class="lottery-progress-actions">
          <button
            class="ghost-btn"
            @click="toggleExpanded(lottery.id)"
          >
            {{ isExpanded(lottery.id) ? 'Ocultar numeros' : 'Elegir numero' }}
          </button>
        </div>

        <div v-if="lottery.winner" class="winner-banner">
          Ganador: <strong>{{ lottery.winner.userName }}</strong>
          <span v-if="lottery.winner.selectedNumber"> | Participo con el N° {{ lottery.winner.selectedNumber }}</span>
        </div>

        <p v-if="successNumberByLottery[lottery.id]" class="lottery-success">
          Numero {{ successNumberByLottery[lottery.id] }} comprado correctamente.
        </p>

        <p v-if="errorByLottery[lottery.id]" class="lottery-error">
          {{ errorByLottery[lottery.id] }}
        </p>

        <div v-if="isExpanded(lottery.id)" class="numbers-panel">
          <div class="numbers-toolbar">
            <div class="filter-group" role="tablist" aria-label="Filtro de numeros">
              <button
                class="filter-btn"
                :class="{ active: getFilter(lottery.id) === 'all' }"
                @click="setFilter(lottery, 'all')"
              >
                Todos
              </button>
              <button
                class="filter-btn"
                :class="{ active: getFilter(lottery.id) === 'available' }"
                @click="setFilter(lottery, 'available')"
              >
                Disponibles
              </button>
              <button
                class="filter-btn"
                :class="{ active: getFilter(lottery.id) === 'sold' }"
                @click="setFilter(lottery, 'sold')"
              >
                Ocupados
              </button>
            </div>

            <small class="page-range">
              Numeros {{ getBounds(lottery.id, getPage(lottery.id)).start }}-{{ getBounds(lottery.id, getPage(lottery.id)).end }}
            </small>
            <button
              class="refresh-btn"
              :disabled="lotteryStore.isNumberPageLoading(lottery.id, getPage(lottery.id))"
              @click="refreshVisiblePage(lottery)"
            >
              Actualizar resultados
            </button>
          </div>

          <p v-if="lotteryStore.isNumberPageLoading(lottery.id, getPage(lottery.id))" class="numbers-loading">
            Cargando numeros...
          </p>

          <div
            v-else
            class="numbers-grid"
            v-memo="[
              lottery.id,
              getPage(lottery.id),
              getFilter(lottery.id),
              lotteryStore.isNumberPageLoading(lottery.id, getPage(lottery.id)),
              successNumberByLottery[lottery.id]
            ]"
            @touchstart="handleNumbersTouchStart"
            @touchmove="handleNumbersTouchMove"
            @touchend="handleNumbersTouchEnd(lottery, $event)"
          >
            <button
              v-for="cell in getNumberCells(lottery.id)"
              :key="`${lottery.id}_${cell.number}`"
              :class="getCellClass(lottery.id, cell)"
              :disabled="lotteryStore.isSelectingNumber(lottery.id, cell.number)"
              @click="openNumberModal(lottery, cell)"
            >
              <img
                v-if="cell.entry?.userProfilePicUrl"
                :src="cell.entry.userProfilePicUrl"
                alt="perfil"
                class="number-avatar"
                loading="lazy"
              />
              <span class="number-label">{{ cell.number }}</span>
              <span v-if="cell.state !== 'available'" class="number-state">
                {{ cell.state === 'mine' ? 'Mio' : 'Ocupado' }}
              </span>
            </button>
          </div>

          <p
            v-if="!lotteryStore.isNumberPageLoading(lottery.id, getPage(lottery.id)) && getNumberCells(lottery.id).length === 0"
            class="numbers-empty"
          >
            No hay numeros para este filtro en la pagina actual.
          </p>

          <div class="pagination">
            <button
              class="ghost-btn"
              :disabled="getPage(lottery.id) <= 1 || lotteryStore.isNumberPageLoading(lottery.id, getPage(lottery.id))"
              @click="setPage(lottery, getPage(lottery.id) - 1)"
            >
              Anterior
            </button>

            <span>
              Pagina {{ getPage(lottery.id) }} / {{ getBounds(lottery.id, getPage(lottery.id)).totalPages }}
            </span>

            <button
              class="ghost-btn"
              :disabled="getPage(lottery.id) >= getBounds(lottery.id, getPage(lottery.id)).totalPages || lotteryStore.isNumberPageLoading(lottery.id, getPage(lottery.id))"
              @click="setPage(lottery, getPage(lottery.id) + 1)"
            >
              Siguiente
            </button>
          </div>
        </div>
      </article>
    </div>

    <div v-if="modalLottery && modalCell" class="number-modal-backdrop" @click="closeNumberModal">
      <div class="number-modal" @click.stop>
        <h3>Numero {{ modalCell.number }}</h3>
        <p v-if="modalLimitReached" class="modal-warning">
          Ya alcanzaste el limite de numeros para esta loteria. Espera el proximo sorteo.
        </p>

        <p v-if="modalCell.state === 'available'">
          Limite por usuario: <strong>{{ getUserTicketLimit(modalLottery) }}</strong>
          | Tus tickets: <strong>{{ getUserTicketCount(modalLottery.id) }}</strong>
        </p>

        <div class="modal-actions">
          <button class="ghost-btn" @click="closeNumberModal">Cerrar</button>
          <button
            v-if="modalCell.state === 'available'"
            class="primary-btn"
            :disabled="!modalCanBuy || modalLimitReached"
            @click="buySelectedNumber"
          >
            {{
              lotteryStore.isSelectingNumber(modalLottery.id, modalCell.number)
                ? 'Comprando...'
                : modalLimitReached
                  ? 'Limite alcanzado'
                  : `seleccionar Nº ${modalCell.number}`
            }}
          </button>
        </div>
      </div>
    </div>

    <AuthPromptModal
      :open="showLoginPrompt"
      title="Inicia sesion para seleccionar un numero"
      message="Con tu cuenta puedes elegir numeros y seguir tus compras de loteria."
      @close="closeLoginPrompt"
    />
  </section>
</template>

<style scoped>
.lottery-loading,
.lottery-empty {
  text-align: center;
  padding: 2rem 1rem;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--card-bg);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 0.8rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.lottery-list {
  display: grid;
  gap: 1rem;
}

.lottery-card {
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--card-bg);
  padding: 1rem;
  overflow: hidden;
}

.lottery-cover-wrap {
  margin: -1rem -1rem 0.85rem;
  height: 150px;
  background: linear-gradient(135deg, #e2e8f0, #f8fafc);
}

.lottery-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lottery-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.lottery-head h3 {
  margin: 0;
  color: var(--text-h);
}

.lottery-description {
  margin: 0.35rem 0 0;
  color: var(--text);
}

.lottery-status {
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  text-transform: uppercase;
  height: fit-content;
}

.lottery-status.status-active {
  background: #e8f7ee;
  color: #166534;
}

.lottery-status.status-closed {
  background: #f3f4f6;
  color: #4b5563;
}

.lottery-status.status-completed {
  background: #eef2ff;
  color: #3730a3;
}

.lottery-status.status-draft {
  background: #fff4e5;
  color: #9a3412;
}

.lottery-meta {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.35rem;
  color: var(--text);
  font-size: 0.86rem;
}

.lottery-progress {
  margin-top: 0.8rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg) 70%, white 30%);
}

.progress-top {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
  color: var(--text-h);
  font-size: 0.83rem;
}

.progress-track {
  margin-top: 0.45rem;
  width: 100%;
  height: 9px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #16a34a, #15803d);
  transition: width 0.25s ease;
}

.lottery-time {
  margin-top: 0.55rem;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.35rem;
  color: var(--text);
  font-size: 0.83rem;
  font-weight: 600;
}

.time-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, var(--bg) 88%);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border) 70%);
  font-size: 0.72rem;
  line-height: 1;
}

.winner-banner {
  margin-top: 0.75rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff6ff;
  color: #1e3a8a;
  font-weight: 600;
}

.lottery-success {
  margin-top: 0.7rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid #b7eb8f;
  border-radius: 10px;
  background: #f6ffed;
  color: #237804;
  font-weight: 700;
}

.lottery-error {
  margin: 0.65rem 0 0;
  padding: 0.58rem 0.68rem;
  border: 1px solid #fca5a5;
  border-radius: 10px;
  background: #fff1f2;
  color: #9f1239;
  font-size: 0.86rem;
  font-weight: 700;
}

.lottery-limit-banner {
  margin: 0.6rem 0 0;
  padding: 0.62rem 0.72rem;
  border: 1px solid #fdba74;
  border-radius: 11px;
  background: #fff7ed;
  color: #9a3412;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.86rem;
  font-weight: 700;
}

.limit-icon {
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ea580c;
  color: #fff;
  font-size: 0.72rem;
  line-height: 1;
}

.lottery-progress-actions {
  margin-top: 0.8rem;
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: center;
}

button {
  border: 0;
  border-radius: 10px;
  padding: 0.55rem 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.ghost-btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
}

.lottery-progress-actions .ghost-btn {
  min-width: 180px;
  padding: 0.72rem 1.2rem;
  font-size: 0.96rem;
  font-weight: 800;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border) 55%);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 14%, #ffffff 86%) 0%,
    color-mix(in srgb, var(--accent) 8%, var(--bg) 92%) 100%
  );
  box-shadow: 0 6px 14px color-mix(in srgb, var(--accent) 24%, transparent 76%);
}

.primary-btn {
  background: var(--accent);
  color: #fff;
}

.number-modal .modal-actions .primary-btn:disabled {
  background: linear-gradient(180deg, #94a3b8 0%, #64748b 100%);
  color: rgba(255, 255, 255, 0.88);
  border: 1px solid #64748b;
  box-shadow: none;
  opacity: 0.58;
  filter: saturate(0.45);
  cursor: not-allowed !important;
  transform: none !important;
  pointer-events: none;
}

button:disabled {
  opacity: 0.65;
  cursor: default;
}

.numbers-panel {
  margin-top: 0.9rem;
  border-top: 1px solid var(--border);
  padding-top: 0.8rem;
  contain: layout paint;
}

.numbers-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: center;
  flex-wrap: wrap;
}

.filter-group {
  display: inline-flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.filter-btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
  padding: 0.4rem 0.65rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.82rem;
}

.filter-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.refresh-btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
  padding: 0.38rem 0.62rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.78rem;
}

.page-range {
  color: var(--text);
}

.numbers-loading,
.numbers-empty {
  margin-top: 0.9rem;
  color: var(--text);
  font-size: 0.9rem;
}

.numbers-grid {
  margin-top: 0.75rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(54px, 1fr));
  gap: 0.5rem;
  touch-action: pan-y;
  contain: layout paint style;
}

.number-btn {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 0;
  transition: transform 0.18s ease, box-shadow 0.2s ease;
  will-change: transform;
}

.number-btn:hover {
  transform: translateY(-1px);
}

.number-btn.state-available {
  border: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 28% 24%, #ffffff 0%, #f4f4f4 26%, #d5d5d5 100%);
  color: #fff;
  font-family: 'Trebuchet MS', 'Verdana', sans-serif;
  font-size: 1.03rem;
  font-weight: 900;
  box-shadow: none;
}

.number-btn.state-available .number-label {
  font-size: 0.9rem;
  font-weight: 900;
  letter-spacing: 0.005em;
  color: #1f2937;
  text-shadow: none;
  min-width: 1.65rem;
  height: 1.65rem;
  padding: 0 0.15rem;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
}

.number-btn.state-available.tilt-neg8 { transform: rotate(-8deg); }
.number-btn.state-available.tilt-neg6 { transform: rotate(-6deg); }
.number-btn.state-available.tilt-neg4 { transform: rotate(-4deg); }
.number-btn.state-available.tilt-neg2 { transform: rotate(-2deg); }
.number-btn.state-available.tilt-0 { transform: rotate(0deg); }
.number-btn.state-available.tilt-pos2 { transform: rotate(2deg); }
.number-btn.state-available.tilt-pos4 { transform: rotate(4deg); }
.number-btn.state-available.tilt-pos6 { transform: rotate(6deg); }
.number-btn.state-available.tilt-pos8 { transform: rotate(8deg); }

.number-btn.state-available.ball-yellow {
  background: radial-gradient(circle at 30% 23%, #fff7c4 0%, #facc15 45%, #ca8a04 100%);
  color: #111827;
}
.number-btn.state-available.ball-blue {
  background: radial-gradient(circle at 30% 23%, #dbeafe 0%, #3b82f6 45%, #1d4ed8 100%);
}
.number-btn.state-available.ball-green {
  background: radial-gradient(circle at 30% 23%, #dcfce7 0%, #22c55e 45%, #15803d 100%);
}
.number-btn.state-available.ball-orange {
  background: radial-gradient(circle at 30% 23%, #ffedd5 0%, #f97316 45%, #c2410c 100%);
}
.number-btn.state-available.ball-red {
  background: radial-gradient(circle at 30% 23%, #fee2e2 0%, #ef4444 45%, #b91c1c 100%);
}
.number-btn.state-available.ball-purple {
  background: radial-gradient(circle at 30% 23%, #f3e8ff 0%, #a855f7 45%, #7e22ce 100%);
}
.number-btn.state-available.ball-cyan {
  background: radial-gradient(circle at 30% 23%, #cffafe 0%, #06b6d4 45%, #0e7490 100%);
}
.number-btn.state-available.ball-black {
  background: radial-gradient(circle at 30% 23%, #d4d4d8 0%, #3f3f46 45%, #111827 100%);
}
.number-btn.state-available.ball-white {
  background: radial-gradient(circle at 30% 23%, #ffffff 0%, #e5e7eb 45%, #cbd5e1 100%);
  color: #111827;
}

.number-btn.state-available:hover {
  scale: 1.08;
  filter: brightness(1.08) saturate(1.06);
  box-shadow: none;
}

.number-btn.state-sold {
  background: #fff1f0;
  border-color: #ffccc7;
  color: #a8071a;
}

.number-btn.state-mine {
  background: #e6f4ff;
  border-color: #91caff;
  color: #0958d9;
  box-shadow: inset 0 0 0 1px rgba(9, 88, 217, 0.15);
}

.number-btn.is-pending {
  opacity: 0.75;
}

.number-btn.just-bought {
  animation: boughtPulse 0.5s ease-in-out;
}

@keyframes boughtPulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}

.number-avatar {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.number-label {
  position: relative;
  z-index: 1;
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.8);
}

.number-btn.state-sold .number-label,
.number-btn.state-mine .number-label {
  background: rgba(255, 255, 255, 0.85);
  border-radius: 999px;
  padding: 0.16rem 0.3rem;
}

.number-state {
  position: absolute;
  bottom: 0.2rem;
  font-size: 0.54rem;
  font-weight: 700;
  line-height: 1;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  padding: 0.12rem 0.28rem;
}

.pagination {
  margin-top: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  flex-wrap: wrap;
  color: var(--text);
}

.modal-owner {
  color: var(--text-h);
  font-size: 0.9rem;
  margin: 0.5rem 0 0;
}

.modal-owner-link {
  color: var(--accent);
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
}

.modal-owner-link:hover {
  text-decoration: underline;
}

.number-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2500;
  background: rgba(0, 0, 0, 0.44);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.number-modal {
  width: min(420px, 100%);
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1rem;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.22);
}

.number-modal h3 {
  margin: 0;
  color: var(--text-h);
}

.modal-warning {
  margin: 0.65rem 0 0.25rem;
  padding: 0.62rem 0.72rem;
  border: 1px solid #fdba74;
  border-radius: 11px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 0.86rem;
  font-weight: 700;
}

.modal-actions {
  margin-top: 1rem;
  display: flex;
  gap: 0.6rem;
  justify-content: flex-end;
  flex-wrap: wrap;
}

@media (max-width: 760px) {
  .numbers-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.35rem;
  }

  .number-label {
    font-size: 0.75rem;
  }

  .number-state {
    display: none;
  }
}

@media (max-width: 640px) {
  .lottery-card {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    padding: 1rem;
    margin-bottom: 0.5rem;
  }

  .lottery-cover-wrap {
    margin: -1rem -1rem 0.85rem;
    height: 140px;
  }

  .lottery-meta {
    font-size: 0.78rem;
    gap: 0.25rem;
  }

  .numbers-panel {
    padding-top: 1rem;
  }

  .numbers-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.3rem;
  }

  .number-btn {
    transition: transform 0.14s ease;
  }

  .number-btn.state-available {
    box-shadow: none;
  }

  .number-btn.state-available:hover {
    transform: none;
  }
}
</style>
