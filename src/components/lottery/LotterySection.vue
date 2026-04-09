<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import { useLotteryStore, type Lottery } from '@/stores/lotteryStore';
import AuthPromptModal from '@/components/common/AuthPromptModal.vue';

const authStore = useAuthStore();
const lotteryStore = useLotteryStore();

const expandedByLottery = ref<Record<string, boolean>>({});
const errorByLottery = ref<Record<string, string>>({});
const showLoginPrompt = ref(false);
const nowMs = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;

const lotteries = computed(() => lotteryStore.publicLotteries);
const loading = computed(() => lotteryStore.publicLoading);

const isExpanded = (lotteryId: string): boolean => Boolean(expandedByLottery.value[lotteryId]);

const toggleExpanded = async (lotteryId: string) => {
  const next = !isExpanded(lotteryId);
  expandedByLottery.value = {
    ...expandedByLottery.value,
    [lotteryId]: next
  };

  if (!next) return;
  if (lotteryStore.getEntries(lotteryId).length > 0) return;
  await lotteryStore.loadEntries(lotteryId, { reset: true });
};

const clearError = (lotteryId: string) => {
  if (!errorByLottery.value[lotteryId]) return;
  const next = { ...errorByLottery.value };
  delete next[lotteryId];
  errorByLottery.value = next;
};

const setError = (lotteryId: string, message: string) => {
  errorByLottery.value = {
    ...errorByLottery.value,
    [lotteryId]: message
  };
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

const canJoinLottery = (lottery: Lottery): boolean => {
  if (!authStore.isAuthenticated) return lotteryStore.isLotteryOpenForEntry(lottery);
  if (lotteryStore.hasJoinedLottery(lottery.id)) return false;
  return lotteryStore.isLotteryOpenForEntry(lottery);
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

const handleJoin = async (lottery: Lottery) => {
  clearError(lottery.id);

  if (!authStore.isAuthenticated) {
    showLoginPrompt.value = true;
    return;
  }

  if (!lotteryStore.isLotteryOpenForEntry(lottery)) {
    setError(lottery.id, 'Esta loteria no acepta nuevos participantes.');
    return;
  }

  try {
    await lotteryStore.joinLottery(lottery.id);
    if (isExpanded(lottery.id)) {
      await lotteryStore.loadEntries(lottery.id, { reset: true });
    }
  } catch (error: any) {
    const code = String(error?.code || '');
    if (code.includes('permission-denied')) {
      setError(lottery.id, 'No tienes permisos para participar en esta loteria.');
      return;
    }
    if (code.includes('failed-precondition')) {
      setError(lottery.id, error?.message || 'La loteria no esta disponible para participar.');
      return;
    }
    setError(lottery.id, error?.message || 'No se pudo registrar tu participacion.');
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
          <span>Participantes: <strong>{{ lottery.participantsCount }}</strong></span>
          <span>Tiempo: <strong>{{ getCountdownLabel(lottery) }}</strong></span>
        </div>

        <div v-if="lottery.winner" class="winner-banner">
          Ganador: <strong>{{ lottery.winner.userName }}</strong>
        </div>

        <footer class="lottery-actions">
          <button
            class="join-btn"
            :disabled="!canJoinLottery(lottery) || lotteryStore.isJoiningLottery(lottery.id)"
            @click="handleJoin(lottery)"
          >
            {{
              lotteryStore.hasJoinedLottery(lottery.id)
                ? 'Ya participas'
                : lotteryStore.isJoiningLottery(lottery.id)
                  ? 'Registrando...'
                  : 'Participar'
            }}
          </button>

          <button
            class="ghost-btn"
            @click="toggleExpanded(lottery.id)"
          >
            {{ isExpanded(lottery.id) ? 'Ocultar participantes' : 'Ver participantes' }}
          </button>
        </footer>

        <p v-if="errorByLottery[lottery.id]" class="lottery-error">
          {{ errorByLottery[lottery.id] }}
        </p>

        <div v-if="isExpanded(lottery.id)" class="participants">
          <p v-if="lotteryStore.isEntriesLoading(lottery.id)">Cargando participantes...</p>
          <p v-else-if="lotteryStore.getEntries(lottery.id).length === 0">
            Todavia no hay participantes.
          </p>
          <ul v-else class="participants-list">
            <li
              v-for="entry in lotteryStore.getEntries(lottery.id)"
              :key="entry.id"
            >
              <span>{{ entry.userName || 'Usuario' }}</span>
              <small>{{ formatDateTime(entry.createdAt) }}</small>
            </li>
          </ul>

          <button
            v-if="lotteryStore.hasMoreEntries(lottery.id)"
            class="ghost-btn more-btn"
            :disabled="lotteryStore.isEntriesLoading(lottery.id)"
            @click="lotteryStore.loadEntries(lottery.id)"
          >
            {{ lotteryStore.isEntriesLoading(lottery.id) ? 'Cargando...' : 'Ver mas participantes' }}
          </button>
        </div>
      </article>
    </div>

    <AuthPromptModal
      :open="showLoginPrompt"
      title="Inicia sesion para participar"
      message="Con tu cuenta puedes entrar en loterias y seguir tus participaciones."
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

.winner-banner {
  margin-top: 0.75rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff6ff;
  color: #1e3a8a;
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

.join-btn {
  background: var(--accent);
  color: #fff;
}

.ghost-btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
}

button:disabled {
  opacity: 0.65;
  cursor: default;
}

.lottery-error {
  margin: 0.6rem 0 0;
  color: #991b1b;
  font-size: 0.85rem;
  font-weight: 600;
}

.participants {
  margin-top: 0.8rem;
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
}

.participants-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.participants-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}

.participants-list small {
  color: var(--text);
}

.more-btn {
  margin-top: 0.65rem;
}
</style>
