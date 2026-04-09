<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { useModuleStore } from '@/stores/moduleStore';
import { useStorageStore } from '@/stores/storageStore';
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
  imageUrl: string;
  status: LotteryStatus;
  endsAt: string;
  maxNumber: number;
  maxTicketsPerUser: number;
};

const MIN_MAX_NUMBER = 10;
const MAX_MAX_NUMBER = 200;
const MIN_MAX_TICKETS_PER_USER = 1;
const MAX_MAX_TICKETS_PER_USER = 5;

const authStore = useAuthStore();
const moduleStore = useModuleStore();
const lotteryStore = useLotteryStore();
const storageStore = useStorageStore();

const moduleEnabled = ref(true);
const savingConfig = ref(false);
const savingLottery = ref(false);
const deletingLotteryId = ref<string | null>(null);
const drawingLotteryId = ref<string | null>(null);
const editingLotteryId = ref<string | null>(null);
const feedback = ref('');
const errorMessage = ref('');
const logoFile = ref<File | null>(null);
const logoPreviewUrl = ref('');
const logoPreviewObjectUrl = ref<string | null>(null);
const logoInputRef = ref<HTMLInputElement | null>(null);

const lotteryForm = reactive<LotteryForm>({
  title: '',
  description: '',
  imageUrl: '',
  status: 'active',
  endsAt: '',
  maxNumber: 100,
  maxTicketsPerUser: 1
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

const dateToDateInputValue = (value: Date | null): string => {
  if (!value) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseInputDate = (value: string, endOfDay: boolean = false): Date | null => {
  if (!value) return null;
  const parsed = new Date(endOfDay ? `${value}T23:59:59` : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const cropLogoToSquare = async (file: File): Promise<File> => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen del logo.'));
      img.src = objectUrl;
    });

    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    if (!sourceSize || sourceSize < 2) {
      throw new Error('Imagen de logo invalida.');
    }

    const sx = Math.floor((image.naturalWidth - sourceSize) / 2);
    const sy = Math.floor((image.naturalHeight - sourceSize) / 2);
    const targetSize = 720;

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('No se pudo preparar el recorte del logo.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, targetSize, targetSize);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.92);
    });
    if (!blob) {
      throw new Error('No se pudo exportar el logo recortado.');
    }

    const safeName = (file.name || 'lottery_logo').replace(/\.[^/.]+$/, '');
    return new File([blob], `${safeName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now()
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const formatReadOnlyDate = (value: Date | null): string => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(value);
};

const resetForm = () => {
  if (logoPreviewObjectUrl.value) {
    URL.revokeObjectURL(logoPreviewObjectUrl.value);
    logoPreviewObjectUrl.value = null;
  }
  editingLotteryId.value = null;
  lotteryForm.title = '';
  lotteryForm.description = '';
  lotteryForm.imageUrl = '';
  lotteryForm.status = 'active';
  lotteryForm.endsAt = '';
  lotteryForm.maxNumber = 100;
  lotteryForm.maxTicketsPerUser = 1;
  logoFile.value = null;
  logoPreviewUrl.value = '';
  if (logoInputRef.value) {
    logoInputRef.value.value = '';
  }
};

const setFormFromLottery = (lottery: Lottery) => {
  if (logoPreviewObjectUrl.value) {
    URL.revokeObjectURL(logoPreviewObjectUrl.value);
    logoPreviewObjectUrl.value = null;
  }
  editingLotteryId.value = lottery.id;
  lotteryForm.title = lottery.title;
  lotteryForm.description = lottery.description;
  lotteryForm.imageUrl = lottery.imageUrl || '';
  lotteryForm.status = lottery.status === 'completed' ? 'closed' : lottery.status;
  lotteryForm.endsAt = dateToDateInputValue(lottery.endsAt);
  lotteryForm.maxNumber = lottery.maxNumber;
  lotteryForm.maxTicketsPerUser = lottery.maxTicketsPerUser;
  logoFile.value = null;
  logoPreviewUrl.value = lottery.imageUrl || '';
  if (logoInputRef.value) {
    logoInputRef.value.value = '';
  }
};

const getAvailableNumbers = (lottery: Lottery): number => {
  return Math.max(0, lottery.maxNumber - lottery.participantsCount);
};

const selectedEditingLottery = computed(() => {
  if (!editingLotteryId.value) return null;
  return lotteries.value.find((lottery) => lottery.id === editingLotteryId.value) || null;
});

const readOnlyStartDateLabel = computed(() => {
  const source = selectedEditingLottery.value?.startsAt || new Date();
  return formatReadOnlyDate(source);
});

const buildPayload = (imageUrl: string): SaveLotteryPayload => {
  const startsAt = selectedEditingLottery.value?.startsAt || new Date();
  const endsAt = parseInputDate(lotteryForm.endsAt, true);
  const maxNumber = Number(lotteryForm.maxNumber);
  const maxTicketsPerUser = Number(lotteryForm.maxTicketsPerUser);

  if (!endsAt) {
    throw new Error('Debes seleccionar una fecha de cierre valida.');
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error('La fecha de cierre debe ser posterior al inicio.');
  }
  if (!Number.isFinite(maxNumber) || Math.floor(maxNumber) !== maxNumber) {
    throw new Error('maxNumber debe ser un entero.');
  }
  if (maxNumber < MIN_MAX_NUMBER || maxNumber > MAX_MAX_NUMBER) {
    throw new Error(`maxNumber debe estar entre ${MIN_MAX_NUMBER} y ${MAX_MAX_NUMBER}.`);
  }
  if (!Number.isFinite(maxTicketsPerUser) || Math.floor(maxTicketsPerUser) !== maxTicketsPerUser) {
    throw new Error('maxTicketsPerUser debe ser un entero.');
  }
  if (
    maxTicketsPerUser < MIN_MAX_TICKETS_PER_USER ||
    maxTicketsPerUser > MAX_MAX_TICKETS_PER_USER
  ) {
    throw new Error(
      `maxTicketsPerUser debe estar entre ${MIN_MAX_TICKETS_PER_USER} y ${MAX_MAX_TICKETS_PER_USER}.`
    );
  }

  return {
    title: lotteryForm.title,
    description: lotteryForm.description,
    imageUrl,
    status: lotteryForm.status,
    startsAt,
    endsAt,
    maxNumber,
    maxTicketsPerUser
  };
};

const handleLogoFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const selected = target.files?.[0] || null;
  if (!selected) return;

  if (!selected.type.startsWith('image/')) {
    errorMessage.value = 'El logo debe ser una imagen valida.';
    target.value = '';
    return;
  }
  if (selected.size > 5 * 1024 * 1024) {
    errorMessage.value = 'El logo no puede superar 5MB.';
    target.value = '';
    return;
  }

  errorMessage.value = '';
  logoFile.value = selected;
  if (logoPreviewObjectUrl.value) {
    URL.revokeObjectURL(logoPreviewObjectUrl.value);
  }
  logoPreviewObjectUrl.value = URL.createObjectURL(selected);
  logoPreviewUrl.value = logoPreviewObjectUrl.value;
};

const clearLogoSelection = () => {
  if (logoPreviewObjectUrl.value) {
    URL.revokeObjectURL(logoPreviewObjectUrl.value);
    logoPreviewObjectUrl.value = null;
  }
  logoFile.value = null;
  logoPreviewUrl.value = '';
  lotteryForm.imageUrl = '';
  if (logoInputRef.value) {
    logoInputRef.value.value = '';
  }
};

const saveLottery = async () => {
  resetFeedback();
  savingLottery.value = true;
  try {
    let finalImageUrl = lotteryForm.imageUrl || '';
    let uploadWarning = '';
    if (logoFile.value) {
      try {
        const processedLogo = await cropLogoToSquare(logoFile.value);
        const ownerId = authStore.user?.uid || 'staff';
        const extension = (processedLogo.name.split('.').pop() || 'webp').toLowerCase();
        const path = `posts/${ownerId}/lotteries/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
        const uploaded = await storageStore.uploadFileWithProgress(processedLogo, path);
        finalImageUrl = uploaded.url;
      } catch {
        uploadWarning = 'No se pudo subir el logo. La loteria se guardo sin imagen.';
      }
    }

    const payload = buildPayload(finalImageUrl.trim());
    if (editingLotteryId.value) {
      await lotteryStore.updateLottery(editingLotteryId.value, payload);
      feedback.value = 'Loteria actualizada.';
    } else {
      await lotteryStore.createLottery(payload);
      feedback.value = 'Loteria creada.';
    }
    if (uploadWarning) {
      feedback.value = `${feedback.value} ${uploadWarning}`.trim();
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
  if (logoPreviewObjectUrl.value) {
    URL.revokeObjectURL(logoPreviewObjectUrl.value);
    logoPreviewObjectUrl.value = null;
  }
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
            <span>Logo opcional</span>
            <input
              ref="logoInputRef"
              type="file"
              accept="image/*"
              @change="handleLogoFileSelect"
            />
            <small class="field-hint">PNG/JPG/WebP hasta 5MB.</small>
          </label>

          <div v-if="logoPreviewUrl || lotteryForm.imageUrl" class="logo-preview-wrap">
            <img :src="logoPreviewUrl || lotteryForm.imageUrl" alt="Logo loteria" class="logo-preview" />
            <button class="ghost danger-outline" type="button" @click="clearLogoSelection">
              Quitar logo
            </button>
          </div>

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
              <span>Hoy</span>
              <div class="readonly-date">{{ readOnlyStartDateLabel }}</div>
            </label>
            <label class="field">
              <span>Cierre</span>
              <input v-model="lotteryForm.endsAt" type="date" />
            </label>
          </div>

          <div class="cols-2">
            <label class="field">
              <span>Maximo de numeros (10-200)</span>
              <input
                v-model.number="lotteryForm.maxNumber"
                type="number"
                min="10"
                max="200"
                step="1"
              />
            </label>
            <label class="field">
              <span>Tickets por usuario (1-5)</span>
              <input
                v-model.number="lotteryForm.maxTicketsPerUser"
                type="number"
                min="1"
                max="5"
                step="1"
              />
            </label>
          </div>

          <div class="actions">
            <button class="primary" :disabled="savingLottery" @click="saveLottery">
              {{
                savingLottery
                  ? `Guardando... ${storageStore.uploading ? `${Math.round(storageStore.uploadProgress)}%` : ''}`
                  : editingLotteryId ? 'Actualizar loteria' : 'Crear loteria'
              }}
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
            <img
              v-if="lottery.imageUrl"
              :src="lottery.imageUrl"
              alt="Logo loteria"
              class="lottery-thumb"
              loading="lazy"
            />
            <div class="lottery-main">
              <h3>{{ lottery.title || 'Sin titulo' }}</h3>
              <p>{{ lottery.description || 'Sin descripcion' }}</p>
              <small>
                Estado <strong>{{ lottery.status }}</strong> |
                Participantes {{ lottery.participantsCount }}
              </small>
              <small>
                Vendidos <strong>{{ lottery.participantsCount }} / {{ lottery.maxNumber }}</strong> |
                Disponibles <strong>{{ getAvailableNumbers(lottery) }}</strong>
              </small>
              <small>
                Limite por usuario <strong>{{ lottery.maxTicketsPerUser }}</strong> |
                Schema v{{ lottery.entrySchemaVersion }} ({{ lottery.migrationStatus }})
              </small>
              <small>
                Inicio {{ lottery.startsAt ? lottery.startsAt.toLocaleString('es-AR') : '-' }} |
                Cierre {{ lottery.endsAt ? lottery.endsAt.toLocaleString('es-AR') : '-' }}
              </small>
              <small v-if="lottery.winner">
                Ganador: <strong>{{ lottery.winner.userName }}</strong>
                <span v-if="lottery.winner.selectedNumber"> | Participo con el N° {{ lottery.winner.selectedNumber }}</span>
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

.field-hint {
  color: var(--text);
  opacity: 0.7;
  font-size: 0.8rem;
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

.readonly-date {
  border: 1px dashed var(--border);
  background: color-mix(in srgb, var(--bg) 85%, transparent);
  color: color-mix(in srgb, var(--text) 72%, transparent);
  border-radius: 10px;
  padding: 0.58rem 0.7rem;
  font-weight: 600;
  pointer-events: none;
  user-select: none;
}

.logo-preview-wrap {
  margin-top: 0.7rem;
  display: flex;
  gap: 0.7rem;
  align-items: center;
  flex-wrap: wrap;
}

.logo-preview {
  width: 86px;
  height: 86px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid var(--border);
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

button.ghost.danger-outline {
  border-color: #fecaca;
  color: #991b1b;
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

.lottery-thumb {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid var(--border);
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
