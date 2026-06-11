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
  imageUrl: string;
  status: LotteryStatus;
  isFree: boolean;
  startsAt: string;
  endsAt: string;
  maxNumber: number;
  maxTicketsPerUser: number;
  hasPremio: boolean;
  premioType: 'dinero' | 'otros';
  premioDinero: number | null;
  premioOtros: string;
};

const MIN_MAX_NUMBER = 10;
const MAX_MAX_NUMBER = 200;
const MIN_MAX_TICKETS_PER_USER = 1;
const MAX_MAX_TICKETS_PER_USER = 5;

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
const logoFile = ref<File | null>(null);
const logoPreviewUrl = ref('');
const logoPreviewObjectUrl = ref<string | null>(null);
const logoInputRef = ref<HTMLInputElement | null>(null);
const uploadProgress = ref(0);
const uploadingLogo = ref(false);

const lotteryForm = reactive<LotteryForm>({
  title: '',
  description: '',
  imageUrl: '',
  status: 'active',
  isFree: true,
  startsAt: '',
  endsAt: '',
  maxNumber: 100,
  maxTicketsPerUser: 1,
  hasPremio: true,
  premioType: 'dinero',
  premioDinero: null,
  premioOtros: ''
});

// Countdown timer
const countdownNow = ref(Date.now());
let countdownInterval: ReturnType<typeof setInterval> | null = null;

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

const dateToDatetimeLocalValue = (value: Date | null): string => {
  if (!value) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const mins = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}`;
};

const parseInputDatetime = (value: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const formatCountdown = (targetMs: number): string => {
  const diffMs = targetMs - countdownNow.value;
  if (diffMs <= 0) return 'Finalizado';
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
};

const processLotteryImage = async (file: File): Promise<{ optimizedFile: File; thumbFile: File }> => {
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

    // 1. Imagen optimizada principal (720x720)
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

    const optimizedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.85);
    });
    if (!optimizedBlob) {
      throw new Error('No se pudo exportar el logo recortado.');
    }

    // 2. Miniatura (240x240)
    const thumbSize = 240;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbSize;
    thumbCanvas.height = thumbSize;
    const thumbContext = thumbCanvas.getContext('2d');
    if (!thumbContext) {
      throw new Error('No se pudo preparar la miniatura del logo.');
    }
    thumbContext.imageSmoothingEnabled = true;
    thumbContext.imageSmoothingQuality = 'high';
    thumbContext.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, thumbSize, thumbSize);

    const thumbBlob = await new Promise<Blob | null>((resolve) => {
      thumbCanvas.toBlob(resolve, 'image/webp', 0.80);
    });
    if (!thumbBlob) {
      throw new Error('No se pudo exportar la miniatura del logo.');
    }

    const safeName = (file.name || 'lottery_logo').replace(/\.[^/.]+$/, '');
    return {
      optimizedFile: new File([optimizedBlob], `${safeName}_o.webp`, {
        type: 'image/webp',
        lastModified: Date.now()
      }),
      thumbFile: new File([thumbBlob], `${safeName}_t.webp`, {
        type: 'image/webp',
        lastModified: Date.now()
      })
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const deriveLotteryThumbnail = (imageUrl: string | null | undefined): string => {
  if (!imageUrl) return '';
  return imageUrl.replace(/_o\.webp$/, '_t.webp');
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
  lotteryForm.isFree = true;
  lotteryForm.startsAt = dateToDatetimeLocalValue(new Date());
  lotteryForm.endsAt = '';
  lotteryForm.maxNumber = 100;
  lotteryForm.maxTicketsPerUser = 1;
  lotteryForm.hasPremio = true;
  lotteryForm.premioType = 'dinero';
  lotteryForm.premioDinero = null;
  lotteryForm.premioOtros = '';
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
  lotteryForm.isFree = lottery.isFree !== false;
  lotteryForm.startsAt = dateToDatetimeLocalValue(lottery.startsAt || new Date());
  lotteryForm.endsAt = dateToDatetimeLocalValue(lottery.endsAt);
  lotteryForm.maxNumber = lottery.maxNumber;
  lotteryForm.maxTicketsPerUser = lottery.maxTicketsPerUser;
  lotteryForm.hasPremio = lottery.hasPremio !== false;
  lotteryForm.premioType = lottery.premioType === 'otros' ? 'otros' : 'dinero';
  lotteryForm.premioDinero = typeof lottery.premioDinero === 'number' ? lottery.premioDinero : null;
  lotteryForm.premioOtros = lottery.premioOtros || '';
  logoFile.value = null;
  logoPreviewUrl.value = lottery.imageUrl || '';
  if (logoInputRef.value) {
    logoInputRef.value.value = '';
  }
};

const getAvailableNumbers = (lottery: Lottery): number => {
  return Math.max(0, lottery.maxNumber - lottery.participantsCount);
};



const buildPayload = (imageUrl: string): SaveLotteryPayload => {
  const startsAt = parseInputDatetime(lotteryForm.startsAt) || new Date();
  const endsAt = parseInputDatetime(lotteryForm.endsAt);
  const maxNumber = Number(lotteryForm.maxNumber);
  const maxTicketsPerUser = Number(lotteryForm.maxTicketsPerUser);
  const isFree = Boolean(lotteryForm.isFree);

  if (!endsAt) {
    throw new Error('Debes seleccionar una fecha y hora de cierre valida.');
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

  let finalPremioDinero: number | null = null;
  let finalPremioOtros = '';

  if (lotteryForm.hasPremio) {
    if (lotteryForm.premioType === 'dinero') {
      if (lotteryForm.premioDinero === null || (lotteryForm.premioDinero as any) === '') {
        throw new Error('Debes ingresar un valor para el premio en dinero.');
      }
      const parsedVal = Number(lotteryForm.premioDinero);
      if (!Number.isFinite(parsedVal) || parsedVal < 0) {
        throw new Error('El premio en dinero debe ser un número válido mayor o igual a 0.');
      }
      finalPremioDinero = parsedVal;
    } else {
      finalPremioOtros = (lotteryForm.premioOtros || '').trim();
      if (!finalPremioOtros) {
        throw new Error('El premio de tipo "otros" no puede estar vacío.');
      }
    }
  }

  return {
    title: lotteryForm.title,
    description: lotteryForm.description,
    imageUrl,
    status: lotteryForm.status,
    isFree,
    startsAt,
    endsAt,
    maxNumber,
    maxTicketsPerUser,
    hasPremio: lotteryForm.hasPremio,
    premioType: lotteryForm.premioType,
    premioDinero: finalPremioDinero,
    premioOtros: finalPremioOtros
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
        const { useStorageStore } = await import('@/stores/storageStore');
        const storageStore = useStorageStore();
        const processed = await processLotteryImage(logoFile.value);
        const ownerId = authStore.user?.uid || 'staff';
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).slice(2, 8);
        uploadingLogo.value = true;
        uploadProgress.value = 0;

        const mainPath = `posts/${ownerId}/lotteries/${timestamp}_${randomString}_o.webp`;
        const thumbPath = `posts/${ownerId}/lotteries/${timestamp}_${randomString}_t.webp`;

        const [mainUpload] = await Promise.all([
          storageStore.uploadFileWithProgress(processed.optimizedFile, mainPath, (progress) => {
            uploadProgress.value = Math.max(uploadProgress.value, progress * 0.5);
          }),
          storageStore.uploadFileWithProgress(processed.thumbFile, thumbPath, (progress) => {
            uploadProgress.value = Math.max(uploadProgress.value, 50 + progress * 0.5);
          })
        ]);

        finalImageUrl = mainUpload.url;
        uploadProgress.value = 100;
      } catch (err: any) {
        console.error('Error procesando/subiendo logo:', err);
        uploadWarning = 'No se pudo subir el logo. La loteria se guardo sin imagen.';
      } finally {
        uploadingLogo.value = false;
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
    uploadProgress.value = 0;
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
  lotteryForm.startsAt = dateToDatetimeLocalValue(new Date());
  countdownInterval = setInterval(() => {
    countdownNow.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (logoPreviewObjectUrl.value) {
    URL.revokeObjectURL(logoPreviewObjectUrl.value);
    logoPreviewObjectUrl.value = null;
  }
  lotteryStore.cleanupAdminLotteries();
  if (countdownInterval) clearInterval(countdownInterval);
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

          <div class="cols-2">
            <label class="field">
              <span>Estado inicial</span>
              <select v-model="lotteryForm.status">
                <option value="draft">Borrador</option>
                <option value="active">Activa</option>
                <option value="closed">Cerrada</option>
              </select>
            </label>

            <label class="field">
              <span>Tipo de lotería</span>
              <select v-model="lotteryForm.isFree">
                <option :value="true">Gratuita (Verificación Social)</option>
                <option :value="false">De Pago (Próximamente)</option>
              </select>
            </label>
          </div>

          <div class="cols-2">
            <label class="field">
              <span>Inicio del sorteo</span>
              <input
                v-model="lotteryForm.startsAt"
                type="datetime-local"
              />
              <small class="field-hint" v-if="lotteryForm.startsAt">
                {{ new Date(lotteryForm.startsAt) > new Date() ? '⏳ Programado — comienza en ' + formatCountdown(new Date(lotteryForm.startsAt).getTime()) : '📅 Fecha actual o pasada' }}
              </small>
            </label>
            <label class="field">
              <span>Cierre del sorteo</span>
              <input
                v-model="lotteryForm.endsAt"
                type="datetime-local"
              />
              <small class="field-hint" v-if="lotteryForm.endsAt">
                {{ new Date(lotteryForm.endsAt) > new Date() ? '⏱ Cierra en ' + formatCountdown(new Date(lotteryForm.endsAt).getTime()) : '⚠️ Fecha ya pasada' }}
              </small>
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

          <div class="field inline" style="margin-top: 1rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <input v-model="lotteryForm.hasPremio" type="checkbox" id="hasPremioCheck" />
            <label for="hasPremioCheck" style="cursor: pointer; font-weight: 600;">¿Esta lotería tiene un premio asociado?</label>
          </div>

          <div v-if="lotteryForm.hasPremio" class="cols-2" style="margin-bottom: 1rem;">
            <label class="field">
              <span>Tipo de premio</span>
              <select v-model="lotteryForm.premioType">
                <option value="dinero">Dinero 💵</option>
                <option value="otros">Otros Premios 🎁</option>
              </select>
            </label>

            <label v-if="lotteryForm.premioType === 'dinero'" class="field">
              <span>Monto en Dinero ($ ARS)</span>
              <input
                v-model.number="lotteryForm.premioDinero"
                type="number"
                min="0"
                placeholder="Ej: 5000"
              />
            </label>

            <label v-else class="field">
              <span>Especificar premio (texto)</span>
              <input
                v-model="lotteryForm.premioOtros"
                type="text"
                maxlength="200"
                placeholder="Ej: Remera Oficial + Gorra"
              />
            </label>
          </div>

          <div class="actions">
            <button class="primary" :disabled="savingLottery" @click="saveLottery">
              {{
                savingLottery
                  ? `Guardando... ${uploadingLogo ? `${Math.round(uploadProgress)}%` : ''}`
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
              :src="deriveLotteryThumbnail(lottery.imageUrl)"
              alt="Logo loteria"
              class="lottery-thumb"
              loading="lazy"
            />
            <div class="lottery-main">
              <h3>{{ lottery.title || 'Sin titulo' }}</h3>
              <p>{{ lottery.description || 'Sin descripcion' }}</p>
              <small>
                Tipo: <strong>{{ lottery.isFree ? 'Gratuita 🎁' : 'De Pago 💳' }}</strong>
              </small>
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
                Inicio <strong>{{ lottery.startsAt ? formatReadOnlyDate(lottery.startsAt) : '-' }}</strong> |
                Cierre <strong>{{ lottery.endsAt ? formatReadOnlyDate(lottery.endsAt) : '-' }}</strong>
              </small>
              <div
                v-if="lottery.endsAt && lottery.status === 'active'"
                class="countdown-chip"
                :class="{ 'countdown-urgent': lottery.endsAt.getTime() - countdownNow < 3600000 }"
              >
                <span class="countdown-icon">⏱</span>
                <span v-if="lottery.endsAt.getTime() > countdownNow">Cierra en {{ formatCountdown(lottery.endsAt.getTime()) }}</span>
                <span v-else>Tiempo agotado</span>
              </div>
              <div
                v-if="lottery.startsAt && lottery.status === 'draft' && lottery.startsAt.getTime() > countdownNow"
                class="countdown-chip countdown-scheduled"
              >
                <span class="countdown-icon">📅</span>
                <span>Inicia en {{ formatCountdown(lottery.startsAt.getTime()) }}</span>
              </div>
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

/* datetime-local: make the calendar icon match the theme */
.field input[type='datetime-local'] {
  cursor: pointer;
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

/* ── Countdown chips ───────────────────────────────── */
.countdown-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.45rem;
  padding: 0.28rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 700;
  background: color-mix(in srgb, var(--accent) 12%, var(--card-bg) 88%);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border) 70%);
  color: var(--accent);
  animation: pulse-chip 2.5s ease-in-out infinite;
}

.countdown-chip.countdown-urgent {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.35);
  color: #dc2626;
  animation: pulse-chip-urgent 1s ease-in-out infinite;
}

.countdown-chip.countdown-scheduled {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.35);
  color: #4f46e5;
  animation: none;
}

.countdown-icon {
  font-size: 0.82rem;
}

.field-hint {
  font-size: 0.79rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
  margin-top: 0.15rem;
}

@keyframes pulse-chip {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.75; }
}

@keyframes pulse-chip-urgent {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(1.03); }
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
