<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import {
  useLotteryStore,
  type Lottery,
  type LotteryNumberCell,
  type LotteryNumberFilter
} from '@/stores/lotteryStore';
import AuthPromptModal from '@/components/common/AuthPromptModal.vue';

const authStore = useAuthStore();
const lotteryStore = useLotteryStore();

const expandedByLottery = ref<Record<string, boolean>>({});
const pageByLottery = ref<Record<string, number>>({});
const filterByLottery = ref<Record<string, LotteryNumberFilter>>({});
const errorByLottery = ref<Record<string, string>>({});
const successNumberByLottery = ref<Record<string, number>>({});
const showLoginPrompt = ref(false);
const nowMs = ref(Date.now());
const modalLotteryId = ref<string | null>(null);
const modalCell = ref<LotteryNumberCell | null>(null);

let nowTimer: ReturnType<typeof setInterval> | null = null;
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

const getCountdownLabel = (lottery: Lottery): string => {
  if (!lottery.endsAt) return 'Sin cierre definido';
  if (lottery.status !== 'active') return 'Cerrada';

  const diff = lottery.endsAt.getTime() - nowMs.value;
  if (diff <= 0) return 'En espera de cierre manual';

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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

const canBuyMoreNumbers = (lottery: Lottery): boolean => {
  return getUserTicketCount(lottery.id) < lottery.maxTicketsPerUser;
};

const getUserNumbersLabel = (lotteryId: string): string => {
  const numbers = lotteryStore.getUserNumbers(lotteryId);
  if (numbers.length === 0) return 'Sin numeros';
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
  for (let page = 1; page <= bounds.totalPages; page += 1) {
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

const getCellClass = (lotteryId: string, cell: LotteryNumberCell): string[] => {
  const classes = ['number-btn', `state-${cell.state}`];
  if (lotteryStore.isSelectingNumber(lotteryId, cell.number)) {
    classes.push('is-pending');
  }
  if (successNumberByLottery.value[lotteryId] === cell.number) {
    classes.push('just-bought');
  }
  return classes;
};

const openNumberModal = (lottery: Lottery, cell: LotteryNumberCell) => {
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

onMounted(() => {
  lotteryStore.initPublicLotteriesListener();
  lotteryStore.initUserEntriesListener();

  nowTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  lotteryStore.cleanupPublicLotteries();

  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }

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
          <span>Vendidos: <strong>{{ lottery.participantsCount }} / {{ lottery.maxNumber }}</strong></span>
          <span>Disponibles: <strong>{{ getAvailableCount(lottery) }}</strong></span>
          <span>Tiempo: <strong>{{ getCountdownLabel(lottery) }}</strong></span>
          <span>Tus numeros: <strong>{{ getUserNumbersLabel(lottery.id) }}</strong></span>
        </div>

        <div class="lottery-progress">
          <div class="progress-top">
            <strong>{{ getSoldProgressPercent(lottery) }}%</strong>
            <span>{{ lottery.participantsCount }} vendidos / {{ getAvailableCount(lottery) }} disponibles</span>
          </div>
          <div class="progress-track" role="progressbar" :aria-valuenow="getSoldProgressPercent(lottery)" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-fill" :style="{ width: `${getSoldProgressPercent(lottery)}%` }"></div>
          </div>
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

        <footer class="lottery-actions">
          <button
            class="ghost-btn"
            @click="toggleExpanded(lottery.id)"
          >
            {{ isExpanded(lottery.id) ? 'Ocultar numeros' : 'Elegir numero' }}
          </button>
        </footer>

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

          <div v-else class="numbers-grid">
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

        <p v-if="modalCell.state === 'available'" class="modal-status available">
          Disponible para compra
        </p>

        <div v-else class="modal-owner">
          <img
            v-if="modalCell.entry?.userProfilePicUrl"
            :src="modalCell.entry.userProfilePicUrl"
            alt="perfil comprador"
            class="modal-owner-avatar"
          />
          <div>
            <p class="modal-status sold">
              {{ modalCell.state === 'mine' ? 'Este numero es tuyo' : 'Numero ocupado' }}
            </p>
            <p>
              Comprador:
              <strong>
                {{ modalCell.state === 'mine' ? 'Tu cuenta' : (modalCell.entry?.userName || 'Usuario') }}
              </strong>
            </p>
            <small>Fecha: {{ formatDateTime(modalCell.entry?.createdAt || null) }}</small>
          </div>
        </div>

        <p v-if="modalCell.state === 'available'">
          Limite por usuario: <strong>{{ modalLottery.maxTicketsPerUser }}</strong>
          | Tus tickets: <strong>{{ getUserTicketCount(modalLottery.id) }}</strong>
        </p>

        <div class="modal-actions">
          <button class="ghost-btn" @click="closeNumberModal">Cerrar</button>
          <button
            v-if="modalCell.state === 'available'"
            class="primary-btn"
            :disabled="!modalCanBuy"
            @click="buySelectedNumber"
          >
            {{ lotteryStore.isSelectingNumber(modalLottery.id, modalCell.number) ? 'Comprando...' : `Comprar ${modalCell.number}` }}
          </button>
        </div>
      </div>
    </div>

    <AuthPromptModal
      :open="showLoginPrompt"
      title="Inicia sesion para comprar numero"
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
  margin: 0.6rem 0 0;
  color: #991b1b;
  font-size: 0.85rem;
  font-weight: 600;
}

.lottery-actions {
  margin-top: 0.8rem;
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
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

.primary-btn {
  background: var(--accent);
  color: #fff;
}

button:disabled {
  opacity: 0.65;
  cursor: default;
}

.numbers-panel {
  margin-top: 0.9rem;
  border-top: 1px solid var(--border);
  padding-top: 0.8rem;
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
}

.number-btn:hover {
  transform: translateY(-1px);
}

.number-btn.state-available {
  background: #f6ffed;
  border-color: #b7eb8f;
  color: #237804;
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

.modal-status {
  margin: 0.65rem 0;
  font-weight: 700;
}

.modal-status.available {
  color: #237804;
}

.modal-status.sold {
  color: #a8071a;
}

.modal-owner {
  margin-top: 0.6rem;
  display: flex;
  gap: 0.7rem;
  align-items: center;
}

.modal-owner-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border);
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
  }
}
</style>
