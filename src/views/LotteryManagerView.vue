<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { useModuleStore } from '@/stores/moduleStore';
import {
  useLotteryStore,
  type Lottery,
  type LotteryStatus,
  type SaveLotteryPayload
} from '@/stores/lotteryStore';
import { isStaffUser } from '@/utils/roles';

type LotteryForm = {
  title: string;
  description: string;
  status: LotteryStatus;
  startsAt: string;
  endsAt: string;
};

const authStore = useAuthStore();
const moduleStore = useModuleStore();
const lotteryStore = useLotteryStore();

const moduleEnabled = ref(true);
const savingConfig = ref(false);
const savingLottery = ref(false);
const deletingLotteryId = ref<string | null>(null);
const drawingLotteryId = ref<string | null>(null);
const editingLotteryId = ref<string | null>(null);
const feedback = ref('');
const errorMessage = ref('');

const lotteryForm = reactive<LotteryForm>({
  title: '',
  description: '',
  status: 'active',
  startsAt: '',
  endsAt: ''
});

const isAuthorized = computed(() => {
  const rol = authStore.userProfile?.rol;
  const email = authStore.user?.email || authStore.userProfile?.email;
  const uid = authStore.user?.uid;
  return authStore.isAuthenticated && isStaffUser(rol, email, uid, authStore.tokenClaims);
});

const formTitle = computed(() => (editingLotteryId.value ? 'Editar loteria' : 'Nueva loteria'));

const lotteries = computed(() => lotteryStore.adminLotteries);

const resetFeedback = () => {
  feedback.value = '';
  errorMessage.value = '';
};

const dateToInputValue = (value: Date | null): string => {
  if (!value) return '';
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const parseInputDate = (value: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const resetForm = () => {
  editingLotteryId.value = null;
  lotteryForm.title = '';
  lotteryForm.description = '';
  lotteryForm.status = 'active';
  lotteryForm.startsAt = '';
  lotteryForm.endsAt = '';
};

const setFormFromLottery = (lottery: Lottery) => {
  editingLotteryId.value = lottery.id;
  lotteryForm.title = lottery.title;
  lotteryForm.description = lottery.description;
  lotteryForm.status = lottery.status === 'completed' ? 'closed' : lottery.status;
  lotteryForm.startsAt = dateToInputValue(lottery.startsAt);
  lotteryForm.endsAt = dateToInputValue(lottery.endsAt);
};

const buildPayload = (): SaveLotteryPayload => {
  const startsAt = parseInputDate(lotteryForm.startsAt);
  const endsAt = parseInputDate(lotteryForm.endsAt);

  if (!startsAt) {
    throw new Error('Debes seleccionar una fecha de inicio valida.');
  }
  if (!endsAt) {
    throw new Error('Debes seleccionar una fecha de cierre valida.');
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error('La fecha de cierre debe ser posterior al inicio.');
  }

  return {
    title: lotteryForm.title,
    description: lotteryForm.description,
    status: lotteryForm.status,
    startsAt,
    endsAt
  };
};

const saveLottery = async () => {
  resetFeedback();
  savingLottery.value = true;
  try {
    const payload = buildPayload();
    if (editingLotteryId.value) {
      await lotteryStore.updateLottery(editingLotteryId.value, payload);
      feedback.value = 'Loteria actualizada.';
    } else {
      await lotteryStore.createLottery(payload);
      feedback.value = 'Loteria creada.';
    }
    resetForm();
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo guardar la loteria.';
  } finally {
    savingLottery.value = false;
  }
};

const saveModuleConfig = async () => {
  resetFeedback();
  savingConfig.value = true;
  try {
    await lotteryStore.setLotteryModuleEnabled(moduleEnabled.value);
    feedback.value = 'Configuracion del modulo de loteria actualizada.';
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo guardar la configuracion.';
  } finally {
    savingConfig.value = false;
  }
};

const closeLottery = async (lotteryId: string) => {
  resetFeedback();
  try {
    await lotteryStore.closeLottery(lotteryId);
    feedback.value = 'Loteria cerrada para nuevos participantes.';
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo cerrar la loteria.';
  }
};

const activateLottery = async (lotteryId: string) => {
  resetFeedback();
  try {
    await lotteryStore.activateLottery(lotteryId);
    feedback.value = 'Loteria activada.';
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo activar la loteria.';
  }
};

const drawWinner = async (lotteryId: string) => {
  const confirmed = window.confirm('Seguro que quieres sortear ganador ahora?');
  if (!confirmed) return;

  resetFeedback();
  drawingLotteryId.value = lotteryId;
  try {
    await lotteryStore.drawLotteryWinner(lotteryId);
    feedback.value = 'Ganador sorteado correctamente.';
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo sortear ganador.';
  } finally {
    drawingLotteryId.value = null;
  }
};

const deleteLottery = async (lotteryId: string) => {
  const confirmed = window.confirm('Seguro que quieres eliminar esta loteria?');
  if (!confirmed) return;

  resetFeedback();
  deletingLotteryId.value = lotteryId;
  try {
    await lotteryStore.softDeleteLottery(lotteryId);
    feedback.value = 'Loteria eliminada.';
    if (editingLotteryId.value === lotteryId) {
      resetForm();
    }
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo eliminar la loteria.';
  } finally {
    deletingLotteryId.value = null;
  }
};

watch(
  () => moduleStore.modules.lottery.enabled,
  (enabled) => {
    moduleEnabled.value = enabled;
  },
  { immediate: true }
);

onMounted(() => {
  if (!isAuthorized.value) return;
  moduleStore.initModulesListener();
  lotteryStore.initAdminLotteriesListener();
});

onBeforeUnmount(() => {
  lotteryStore.cleanupAdminLotteries();
});
</script>

<template>
  <section class="lottery-page">
    <header class="page-head">
      <h1>Gestion de Loteria</h1>
      <p>Staff puede crear loterias, cerrarlas y sortear ganador manualmente.</p>
    </header>

    <div v-if="!isAuthorized" class="restricted-card">
      <h2>No tienes acceso a este modulo</h2>
      <p>Necesitas rol admin o colaborador para gestionar loterias.</p>
      <RouterLink to="/" class="go-home">Volver al inicio</RouterLink>
    </div>

    <template v-else>
      <p v-if="feedback" class="msg ok">{{ feedback }}</p>
      <p v-if="errorMessage" class="msg error">{{ errorMessage }}</p>

      <div class="grid">
        <article class="card">
          <h2>Configuracion del modulo</h2>
          <label class="field inline">
            <input v-model="moduleEnabled" type="checkbox" />
            <span>Modulo loteria habilitado</span>
          </label>

          <div class="actions">
            <button class="primary" :disabled="savingConfig" @click="saveModuleConfig">
              {{ savingConfig ? 'Guardando...' : 'Guardar configuracion' }}
            </button>
          </div>
        </article>

        <article class="card">
          <h2>{{ formTitle }}</h2>

          <label class="field">
            <span>Titulo</span>
            <input
              v-model="lotteryForm.title"
              type="text"
              maxlength="150"
              placeholder="Ej: Sorteo semanal de la comunidad"
            />
          </label>

          <label class="field">
            <span>Descripcion</span>
            <textarea
              v-model="lotteryForm.description"
              rows="3"
              maxlength="2000"
              placeholder="Reglas o contexto breve del sorteo"
            ></textarea>
          </label>

          <label class="field">
            <span>Estado inicial</span>
            <select v-model="lotteryForm.status">
              <option value="draft">Borrador</option>
              <option value="active">Activa</option>
              <option value="closed">Cerrada</option>
            </select>
          </label>

          <div class="cols-2">
            <label class="field">
              <span>Inicio</span>
              <input v-model="lotteryForm.startsAt" type="datetime-local" />
            </label>
            <label class="field">
              <span>Cierre</span>
              <input v-model="lotteryForm.endsAt" type="datetime-local" />
            </label>
          </div>

          <div class="actions">
            <button class="primary" :disabled="savingLottery" @click="saveLottery">
              {{ savingLottery ? 'Guardando...' : editingLotteryId ? 'Actualizar loteria' : 'Crear loteria' }}
            </button>
            <button class="ghost" :disabled="savingLottery" @click="resetForm">Limpiar</button>
          </div>
        </article>
      </div>

      <article class="card list-card">
        <h2>Loterias cargadas</h2>
        <p v-if="lotteryStore.adminLoading">Cargando loterias...</p>
        <p v-else-if="lotteries.length === 0">Aun no hay loterias creadas.</p>

        <div v-else class="lottery-list">
          <div v-for="lottery in lotteries" :key="lottery.id" class="lottery-item">
            <div class="lottery-main">
              <h3>{{ lottery.title || 'Sin titulo' }}</h3>
              <p>{{ lottery.description || 'Sin descripcion' }}</p>
              <small>
                Estado <strong>{{ lottery.status }}</strong> |
                Participantes {{ lottery.participantsCount }}
              </small>
              <small>
                Inicio {{ lottery.startsAt ? lottery.startsAt.toLocaleString('es-AR') : '-' }} |
                Cierre {{ lottery.endsAt ? lottery.endsAt.toLocaleString('es-AR') : '-' }}
              </small>
              <small v-if="lottery.winner">
                Ganador: <strong>{{ lottery.winner.userName }}</strong>
              </small>
            </div>

            <div class="lottery-actions">
              <button class="ghost" @click="setFormFromLottery(lottery)">Editar</button>
              <button
                v-if="lottery.status !== 'closed' && lottery.status !== 'completed'"
                class="ghost"
                @click="closeLottery(lottery.id)"
              >
                Cerrar
              </button>
              <button
                v-if="lottery.status === 'closed'"
                class="ghost"
                @click="activateLottery(lottery.id)"
              >
                Reabrir
              </button>
              <button
                v-if="lottery.status === 'closed' && !lottery.winner"
                class="primary"
                :disabled="drawingLotteryId === lottery.id || lotteryStore.isDrawingLottery(lottery.id)"
                @click="drawWinner(lottery.id)"
              >
                {{
                  drawingLotteryId === lottery.id || lotteryStore.isDrawingLottery(lottery.id)
                    ? 'Sorteando...'
                    : 'Sortear ganador'
                }}
              </button>
              <button
                class="danger"
                :disabled="deletingLotteryId === lottery.id"
                @click="deleteLottery(lottery.id)"
              >
                {{ deletingLotteryId === lottery.id ? 'Eliminando...' : 'Eliminar' }}
              </button>
            </div>
          </div>
        </div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.lottery-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2rem;
}

.page-head h1 {
  margin: 0;
  color: var(--text-h);
}

.page-head p {
  margin: 0.35rem 0 0;
  color: var(--text);
}

.restricted-card,
.card {
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 16px;
  padding: 1rem;
  margin-top: 1rem;
}

.go-home {
  display: inline-block;
  margin-top: 0.7rem;
  color: var(--accent);
  text-decoration: none;
  font-weight: 700;
}

.msg {
  margin-top: 0.8rem;
  padding: 0.7rem 0.9rem;
  border-radius: 10px;
  font-weight: 600;
}

.msg.ok {
  background: #e8f7ee;
  color: #166534;
}

.msg.error {
  background: #feeceb;
  color: #991b1b;
}

.grid {
  margin-top: 1rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.cols-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.7rem;
}

.field.inline {
  flex-direction: row;
  align-items: center;
  gap: 0.55rem;
}

.field span {
  color: var(--text-h);
  font-weight: 600;
  font-size: 0.92rem;
}

.field input,
.field textarea,
.field select {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
  border-radius: 10px;
  padding: 0.58rem 0.7rem;
  font: inherit;
}

.actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

button {
  border: 0;
  border-radius: 10px;
  padding: 0.58rem 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

button.primary {
  background: var(--accent);
  color: #fff;
}

button.ghost {
  background: var(--social-bg);
  color: var(--text-h);
  border: 1px solid var(--border);
}

button.danger {
  background: #991b1b;
  color: #fff;
}

button:disabled {
  opacity: 0.65;
  cursor: default;
}

.list-card {
  margin-top: 1rem;
}

.lottery-list {
  display: grid;
  gap: 0.85rem;
}

.lottery-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.85rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.lottery-main h3 {
  margin: 0;
  color: var(--text-h);
}

.lottery-main p {
  margin: 0.25rem 0 0.45rem;
  color: var(--text);
}

.lottery-main small {
  display: block;
  color: var(--text);
}

.lottery-actions {
  display: flex;
  gap: 0.45rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

@media (max-width: 960px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .cols-2 {
    grid-template-columns: 1fr;
  }

  .lottery-item {
    flex-direction: column;
  }
}
</style>
