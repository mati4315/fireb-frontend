<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

type AdminLotteryOption = {
  id: string;
  title: string;
  status: string;
  maxNumber: number;
  maxTicketsPerUser: number;
};

const props = defineProps<{
  open: boolean;
  userId: string;
  username: string;
  email?: string;
  facebookMode?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'success', payload: { lotteryId: string; extraTickets: number; effectiveLimit: number }): void;
}>();

const lotteriesForTickets = ref<AdminLotteryOption[]>([]);
const ticketExtrasByLottery = ref<Record<string, number>>({});
const selectedLotteryId = ref('');
const extraTicketsToAdd = ref(1);
const loading = ref(false);
const saving = ref(false);
const resolvingFacebookUser = ref(false);
const facebookUserIdInput = ref('');
const resolvedFacebookUserId = ref('');
const resolvedFacebookParticipantType = ref<'user' | 'facebook_guest' | ''>('');
const facebookIdentityExists = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const isFacebookMode = computed(() => props.facebookMode === true);
const isFacebookTargetResolved = computed(() => {
  return Boolean(
    isFacebookMode.value &&
    facebookUserIdInput.value.trim() &&
    resolvedFacebookUserId.value === facebookUserIdInput.value.trim()
  );
});
const displayedUsername = computed(() => {
  if (isFacebookMode.value) return facebookUserIdInput.value.trim() || 'Invitado de Facebook';
  return props.username || 'Usuario';
});

const selectedLottery = computed(() => {
  return lotteriesForTickets.value.find((l) => l.id === selectedLotteryId.value) || null;
});

const selectedLotteryCurrentExtra = computed(() => {
  if (!selectedLotteryId.value) return 0;
  return Math.max(0, Math.floor(ticketExtrasByLottery.value[selectedLotteryId.value] || 0));
});

const selectedLotteryEffectiveLimit = computed(() => {
  const lottery = selectedLottery.value;
  if (!lottery) return 0;
  return Math.min(lottery.maxNumber, lottery.maxTicketsPerUser + selectedLotteryCurrentExtra.value);
});

const resetFeedback = () => {
  errorMessage.value = null;
  successMessage.value = null;
};

const fetchLotteries = async () => {
  const callable = httpsCallable(functions, 'listLotteriesForAdmin');
  const response = await callable({});
  const payload = (response.data || {}) as {
    lotteries?: Array<{
      id?: string;
      title?: string;
      status?: string;
      maxNumber?: number;
      maxTicketsPerUser?: number;
    }>;
  };

  const options = (payload.lotteries || [])
    .map((item) => ({
      id: (item.id || '').toString().trim(),
      title: (item.title || '').toString().trim() || '(Sin titulo)',
      status: (item.status || 'draft').toString().trim(),
      maxNumber: Math.max(1, Math.floor(Number(item.maxNumber) || 1)),
      maxTicketsPerUser: Math.max(1, Math.floor(Number(item.maxTicketsPerUser) || 1))
    }))
    .filter((item) => item.id.length > 0);

  lotteriesForTickets.value = options;
  if (options.length > 0 && !options.some((l) => l.id === selectedLotteryId.value)) {
    selectedLotteryId.value = options[0].id;
  }
};

const fetchUserLotteryTicketExtras = async (target: { userId?: string; facebookUserId?: string }) => {
  const callable = httpsCallable(functions, 'getLotteryUserTicketExtras');
  const response = await callable(target);
  const payload = (response.data || {}) as {
    records?: Record<string, unknown>;
    participantType?: 'user' | 'facebook_guest';
    identityExists?: boolean;
  };
  const normalized: Record<string, number> = {};
  const records = payload.records || {};
  for (const [lotteryId, value] of Object.entries(records)) {
    normalized[lotteryId] = Math.max(0, Math.floor(Number(value) || 0));
  }
  ticketExtrasByLottery.value = normalized;
  return payload;
};

const loadData = async () => {
  if (!props.open || (!isFacebookMode.value && !props.userId)) return;
  loading.value = true;
  selectedLotteryId.value = '';
  extraTicketsToAdd.value = 1;
  ticketExtrasByLottery.value = {};
  if (isFacebookMode.value) facebookUserIdInput.value = '';
  resolvedFacebookUserId.value = '';
  resolvedFacebookParticipantType.value = '';
  facebookIdentityExists.value = false;
  resetFeedback();

  try {
    await fetchLotteries();
    if (!isFacebookMode.value && props.userId) {
      await fetchUserLotteryTicketExtras({ userId: props.userId });
    }
  } catch (error: any) {
    errorMessage.value = `No se pudieron cargar los datos: ${error?.message || error}`;
  } finally {
    loading.value = false;
  }
};

const lookupFacebookUser = async () => {
  const facebookUserId = facebookUserIdInput.value.trim();
  if (!facebookUserId) {
    errorMessage.value = 'Ingresa el facebook_user_id para buscar al participante.';
    return;
  }

  resolvingFacebookUser.value = true;
  resolvedFacebookUserId.value = '';
  resolvedFacebookParticipantType.value = '';
  facebookIdentityExists.value = false;
  ticketExtrasByLottery.value = {};
  resetFeedback();
  try {
    const payload = await fetchUserLotteryTicketExtras({ facebookUserId });
    resolvedFacebookUserId.value = facebookUserId;
    resolvedFacebookParticipantType.value = payload.participantType || 'facebook_guest';
    facebookIdentityExists.value = payload.identityExists === true;
  } catch (error: any) {
    errorMessage.value = `No se pudo resolver ese Facebook ID: ${error?.message || error}`;
  } finally {
    resolvingFacebookUser.value = false;
  }
};

const refreshCurrentTargetExtras = async () => {
  if (isFacebookMode.value) {
    if (!isFacebookTargetResolved.value) return;
    const payload = await fetchUserLotteryTicketExtras({
      facebookUserId: resolvedFacebookUserId.value
    });
    resolvedFacebookParticipantType.value = payload.participantType || 'facebook_guest';
    facebookIdentityExists.value = payload.identityExists === true;
    return;
  }
  if (props.userId) await fetchUserLotteryTicketExtras({ userId: props.userId });
};

const grantTickets = async () => {
  if ((!isFacebookMode.value && !props.userId) ||
    (isFacebookMode.value && !isFacebookTargetResolved.value) ||
    !selectedLotteryId.value) return;
  const quantity = Math.max(1, Math.floor(Number(extraTicketsToAdd.value) || 1));
  saving.value = true;
  resetFeedback();

  try {
    const callable = httpsCallable(functions, 'grantLotteryUserExtraTickets');
    const response = await callable({
      ...(isFacebookMode.value
        ? { facebookUserId: resolvedFacebookUserId.value }
        : { userId: props.userId }),
      lotteryId: selectedLotteryId.value,
      quantity
    });
    const payload = (response.data || {}) as {
      added?: number;
      extraTickets?: number;
      effectiveLimit?: number;
    };

    const nextExtra = Math.max(0, Math.floor(Number(payload.extraTickets) || 0));
    ticketExtrasByLottery.value = {
      ...ticketExtrasByLottery.value,
      [selectedLotteryId.value]: nextExtra
    };

    const added = Math.max(1, Math.floor(Number(payload.added) || quantity));
    const resolvedLimit = Math.max(1, Math.floor(Number(payload.effectiveLimit) || 1));
    successMessage.value = `Se agregaron ${added} ticket(s) extra. Nuevo limite: ${resolvedLimit}.`;
    extraTicketsToAdd.value = 1;

    emit('success', {
      lotteryId: selectedLotteryId.value,
      extraTickets: nextExtra,
      effectiveLimit: resolvedLimit
    });

    setTimeout(() => {
      emit('close');
    }, 1200);
  } catch (error: any) {
    errorMessage.value = `No se pudieron agregar tickets: ${error?.message || error}`;
  } finally {
    saving.value = false;
  }
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      loadData();
    }
  },
  { immediate: true }
);

watch(facebookUserIdInput, () => {
  resolvedFacebookUserId.value = '';
  resolvedFacebookParticipantType.value = '';
  facebookIdentityExists.value = false;
  ticketExtrasByLottery.value = {};
});

watch(selectedLotteryId, async () => {
  if (!props.open || !selectedLotteryId.value) return;
  try {
    await refreshCurrentTargetExtras();
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo cargar el extra actual.';
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="lottery-tickets-overlay" @click.self="emit('close')">
      <div class="lottery-tickets-card">
        <header class="lottery-tickets-head">
          <h3>Tickets de Loteria: @{{ displayedUsername }}</h3>
          <button class="close-btn" @click="emit('close')">×</button>
        </header>

        <div class="lottery-tickets-body">
          <div v-if="successMessage" class="tickets-msg ok">{{ successMessage }}</div>
          <div v-if="errorMessage" class="tickets-msg error">{{ errorMessage }}</div>

          <div v-if="isFacebookMode" class="facebook-lookup">
            <div class="tickets-form-field">
              <label for="facebook-ticket-user-id">facebook_user_id</label>
              <input
                id="facebook-ticket-user-id"
                v-model="facebookUserIdInput"
                type="text"
                maxlength="180"
                autocomplete="off"
                placeholder="Ejemplo: meyifotografia"
                @keydown.enter.prevent="lookupFacebookUser"
              />
              <small>Usa el identificador estable de Facebook, no el nombre visible.</small>
            </div>
            <button
              class="lookup-btn"
              type="button"
              :disabled="resolvingFacebookUser || !facebookUserIdInput.trim()"
              @click="lookupFacebookUser"
            >
              {{ resolvingFacebookUser ? 'Buscando…' : 'Buscar participante' }}
            </button>
          </div>

          <div class="tickets-summary">
            <div class="sum-row">
              <span class="lbl">Usuario</span>
              <span class="val">@{{ displayedUsername }}</span>
            </div>
            <div v-if="isFacebookMode && isFacebookTargetResolved" class="sum-row">
              <span class="lbl">Identidad</span>
              <span class="val">
                {{ resolvedFacebookParticipantType === 'user' ? 'Cuenta de Cdelu vinculada' : 'Invitado de Facebook' }}
              </span>
              <small v-if="!facebookIdentityExists">La identidad se preparará al guardar la excepción.</small>
            </div>
            <div class="sum-row" v-if="email">
              <span class="lbl">Email</span>
              <span class="val">{{ email }}</span>
            </div>
            <div class="sum-row" v-if="selectedLottery">
              <span class="lbl">Tickets Extra Actuales</span>
              <span class="val">{{ selectedLotteryCurrentExtra }}</span>
            </div>
            <div class="sum-row" v-if="selectedLottery">
              <span class="lbl">Limite Efectivo</span>
              <span class="val">{{ selectedLotteryEffectiveLimit }}</span>
            </div>
          </div>

          <div v-if="loading" class="tickets-loading">Cargando datos...</div>
          <div v-else-if="isFacebookMode && !isFacebookTargetResolved" class="tickets-loading">
            Busca primero el facebook_user_id para consultar o asignar sus tickets.
          </div>

          <template v-else-if="!isFacebookMode || isFacebookTargetResolved">
            <div class="tickets-form-field">
              <label>Loteria</label>
              <select v-model="selectedLotteryId">
                <option value="" disabled>Selecciona una loteria</option>
                <option
                  v-for="lottery in lotteriesForTickets"
                  :key="lottery.id"
                  :value="lottery.id"
                >
                  {{ lottery.title }} ({{ lottery.status }}) - Base {{ lottery.maxTicketsPerUser }}
                </option>
              </select>
            </div>

            <div class="tickets-form-field">
              <label>Tickets extra a agregar</label>
              <input
                v-model.number="extraTicketsToAdd"
                type="number"
                min="1"
                max="200"
              />
            </div>
          </template>
        </div>

        <footer class="lottery-tickets-foot">
          <button
            class="primary-btn-tickets"
            :disabled="saving || loading || !selectedLotteryId || (isFacebookMode && !isFacebookTargetResolved)"
            @click="grantTickets"
          >
            {{ saving ? 'Guardando...' : 'Agregar Tickets' }}
          </button>
          <button class="ghost-btn-tickets" @click="emit('close')">Cerrar</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.lottery-tickets-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1000;
  overflow-y: auto;
}

.lottery-tickets-card {
  background: var(--card-bg);
  width: 100%;
  max-width: 520px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}

.lottery-tickets-head {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lottery-tickets-head h3 {
  margin: 0;
  color: var(--text-h);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text);
}

.lottery-tickets-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.tickets-msg {
  padding: 1rem;
  border-radius: 12px;
  font-weight: 600;
}

.tickets-msg.ok {
  background: #dcfce7;
  color: #166534;
}

.tickets-msg.error {
  background: #fee2e2;
  color: #991b1b;
}

.tickets-summary {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--bg);
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid var(--border);
}

.sum-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.sum-row .lbl {
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--text-s, #64748b);
  letter-spacing: 0.05em;
}

.sum-row .val {
  font-size: 0.95rem;
  color: var(--text-h);
  word-break: break-all;
}

.tickets-loading {
  text-align: center;
  color: var(--text);
  padding: 1rem;
}

.tickets-form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tickets-form-field label {
  font-weight: 700;
  color: var(--text-h);
}

.tickets-form-field small {
  color: var(--text-s, #64748b);
  line-height: 1.4;
}

.facebook-lookup {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 0.75rem;
}

.lookup-btn {
  min-height: 44px;
  border: 1px solid var(--accent);
  border-radius: 12px;
  padding: 0.65rem 1rem;
  background: color-mix(in srgb, var(--accent) 12%, var(--card-bg));
  color: var(--text-h);
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.lookup-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tickets-form-field select,
.tickets-form-field input {
  width: 100%;
  padding: 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
}

.lottery-tickets-foot {
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 0.75rem;
  background: var(--card-bg);
}

.primary-btn-tickets {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 0.7rem 1.2rem;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
}

.ghost-btn-tickets {
  background: var(--bg);
  color: var(--text-h);
  border: 1px solid var(--border);
  padding: 0.7rem 1.2rem;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .lottery-tickets-overlay {
    padding: 0.5rem;
  }

  .lottery-tickets-card {
    border-radius: 16px;
  }

  .lottery-tickets-head,
  .lottery-tickets-body,
  .lottery-tickets-foot {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .lottery-tickets-foot {
    flex-direction: column-reverse;
  }

  .lottery-tickets-foot button {
    width: 100%;
  }

  .facebook-lookup {
    grid-template-columns: 1fr;
  }
}
</style>
