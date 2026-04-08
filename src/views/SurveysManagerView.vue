<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { useModuleStore } from '@/stores/moduleStore';
import { isStaffUser } from '@/utils/roles';
import {
  useSurveyStore,
  type SaveSurveyPayload,
  type Survey,
  type SurveyEditorOption,
  type SurveyStatus
} from '@/stores/surveyStore';

type SurveyForm = {
  question: string;
  description: string;
  status: SurveyStatus;
  durationMinutes: number;
  isMultipleChoice: boolean;
  maxVotesPerUser: number;
  options: SurveyEditorOption[];
};

const authStore = useAuthStore();
const moduleStore = useModuleStore();
const surveyStore = useSurveyStore();

const savingSurvey = ref(false);
const savingConfig = ref(false);
const deletingSurveyId = ref<string | null>(null);
const editingSurveyId = ref<string | null>(null);
const moduleEnabled = ref(true);
const feedback = ref('');
const errorMessage = ref('');

const surveyForm = reactive<SurveyForm>({
  question: '',
  description: '',
  status: 'active',
  durationMinutes: 30,
  isMultipleChoice: false,
  maxVotesPerUser: 1,
  options: [
    { text: '', active: true },
    { text: '', active: true }
  ]
});

const isAuthorized = computed(() => {
  const rol = authStore.userProfile?.rol;
  const email = authStore.user?.email || authStore.userProfile?.email;
  const uid = authStore.user?.uid;
  return authStore.isAuthenticated && isStaffUser(rol, email, uid, authStore.tokenClaims);
});

const editingSurvey = computed<Survey | null>(() => {
  if (!editingSurveyId.value) return null;
  return surveyStore.adminSurveys.find((survey) => survey.id === editingSurveyId.value) || null;
});

const hasExistingVotes = computed(() => {
  return Boolean(editingSurvey.value && editingSurvey.value.totalVotes > 0);
});

const existingOptionIds = computed(() => {
  const ids = new Set<string>();
  for (const option of editingSurvey.value?.options || []) {
    ids.add(option.id);
  }
  return ids;
});

const formTitle = computed(() => {
  return editingSurveyId.value ? 'Editar encuesta' : 'Nueva encuesta';
});

const resetFeedback = () => {
  feedback.value = '';
  errorMessage.value = '';
};

const ensureTwoOptions = () => {
  while (surveyForm.options.length < 2) {
    surveyForm.options.push({ text: '', active: true });
  }
};

const resetForm = () => {
  editingSurveyId.value = null;
  surveyForm.question = '';
  surveyForm.description = '';
  surveyForm.status = 'active';
  surveyForm.durationMinutes = 30;
  surveyForm.isMultipleChoice = false;
  surveyForm.maxVotesPerUser = 1;
  surveyForm.options = [
    { text: '', active: true },
    { text: '', active: true }
  ];
};

const setFormFromSurvey = (survey: Survey) => {
  editingSurveyId.value = survey.id;
  surveyForm.question = survey.question;
  surveyForm.description = survey.description;
  surveyForm.status = survey.status;
  surveyForm.durationMinutes = survey.durationMinutes || 30;
  surveyForm.isMultipleChoice = survey.isMultipleChoice;
  surveyForm.maxVotesPerUser = survey.maxVotesPerUser;
  surveyForm.options = survey.options.map((option) => ({
    id: option.id,
    text: option.text,
    active: option.active
  }));
  ensureTwoOptions();
};

const addOption = () => {
  surveyForm.options.push({ text: '', active: true });
};

const removeOrHideOption = (index: number) => {
  const option = surveyForm.options[index];
  if (!option) return;

  const isExisting = option.id && existingOptionIds.value.has(option.id);
  if (hasExistingVotes.value && isExisting) {
    option.active = false;
    feedback.value = 'La opcion se oculto para conservar votos historicos.';
    return;
  }

  if (surveyForm.options.length <= 2) {
    errorMessage.value = 'La encuesta debe tener al menos 2 opciones.';
    return;
  }

  surveyForm.options.splice(index, 1);
};

const saveModuleConfig = async () => {
  resetFeedback();
  savingConfig.value = true;
  try {
    await surveyStore.setSurveysModuleEnabled(moduleEnabled.value);
    feedback.value = 'Configuracion del modulo de encuestas actualizada.';
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo guardar la configuracion.';
  } finally {
    savingConfig.value = false;
  }
};

const buildPayload = (): SaveSurveyPayload => {
  const isMultipleChoice = Boolean(surveyForm.isMultipleChoice);
  const maxVotesPerUser = isMultipleChoice
    ? Math.max(1, Math.min(20, Number(surveyForm.maxVotesPerUser || 1)))
    : 1;

  return {
    question: surveyForm.question,
    description: surveyForm.description,
    status: surveyForm.status,
    durationMinutes: Math.max(10, Math.min(1440, Number(surveyForm.durationMinutes || 30))),
    isMultipleChoice,
    maxVotesPerUser,
    options: surveyForm.options.map((option) => ({
      id: option.id,
      text: option.text,
      active: option.active
    }))
  };
};

const saveSurvey = async () => {
  resetFeedback();
  savingSurvey.value = true;

  try {
    const payload = buildPayload();
    if (editingSurveyId.value) {
      await surveyStore.updateSurvey(editingSurveyId.value, payload);
      feedback.value = 'Encuesta actualizada correctamente.';
    } else {
      await surveyStore.createSurvey(payload);
      feedback.value = 'Encuesta creada correctamente.';
    }
    resetForm();
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo guardar la encuesta.';
  } finally {
    savingSurvey.value = false;
  }
};

const deleteSurvey = async (surveyId: string) => {
  const confirmed = window.confirm('Seguro que quieres eliminar esta encuesta?');
  if (!confirmed) return;

  resetFeedback();
  deletingSurveyId.value = surveyId;
  try {
    await surveyStore.deleteSurvey(surveyId);
    feedback.value = 'Encuesta eliminada.';
    if (editingSurveyId.value === surveyId) {
      resetForm();
    }
  } catch (error: any) {
    errorMessage.value = error?.message || 'No se pudo eliminar la encuesta.';
  } finally {
    deletingSurveyId.value = null;
  }
};

watch(
  () => moduleStore.modules.surveys.enabled,
  (enabled) => {
    moduleEnabled.value = enabled;
  },
  { immediate: true }
);

onMounted(() => {
  if (!isAuthorized.value) return;
  moduleStore.initModulesListener();
  surveyStore.initAdminSurveysListener();
});

onBeforeUnmount(() => {
  surveyStore.cleanupAdminSurveys();
});
</script>

<template>
  <section class="surveys-page">
    <header class="page-head">
      <h1>Gestion de Encuestas</h1>
      <p>Crea encuestas, activa o desactiva el modulo y administra resultados en tiempo real.</p>
    </header>

    <div v-if="!isAuthorized" class="restricted-card">
      <h2>No tienes acceso a este modulo</h2>
      <p>Necesitas rol admin o colaborador para gestionar encuestas.</p>
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
            <span>Modulo encuestas habilitado</span>
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
            <span>Pregunta</span>
            <input
              v-model="surveyForm.question"
              type="text"
              placeholder="Ej: Cual feature te gusta mas?"
            />
          </label>

          <label class="field">
            <span>Descripcion (opcional)</span>
            <textarea
              v-model="surveyForm.description"
              rows="3"
              placeholder="Contexto breve para la encuesta"
            ></textarea>
          </label>

          <div class="cols-2">
            <label class="field">
              <span>Estado</span>
              <select v-model="surveyForm.status">
                <option value="active">Activa</option>
                <option value="inactive">Inactiva</option>
                <option value="completed">Finalizada</option>
              </select>
            </label>

            <label class="field">
              <span>Duracion</span>
              <select v-model.number="surveyForm.durationMinutes">
                <option :value="10">10 minutos</option>
                <option :value="30">30 minutos</option>
                <option :value="120">2 horas</option>
                <option :value="1440">1 dia</option>
              </select>
            </label>
          </div>

          <div class="cols-2">
            <label class="field inline">
              <input v-model="surveyForm.isMultipleChoice" type="checkbox" />
              <span>Permite seleccion multiple</span>
            </label>

            <label class="field">
              <span>Maximo de votos por usuario</span>
              <input
                v-model.number="surveyForm.maxVotesPerUser"
                :disabled="!surveyForm.isMultipleChoice"
                type="number"
                min="1"
                max="20"
              />
            </label>
          </div>

          <div class="field">
            <span>Opciones</span>
            <div class="option-list">
              <div
                v-for="(option, index) in surveyForm.options"
                :key="option.id || `new_${index}`"
                class="option-item"
              >
                <input
                  v-model="option.text"
                  type="text"
                  :disabled="Boolean(hasExistingVotes && option.id && existingOptionIds.has(option.id))"
                  placeholder="Texto de opcion"
                />
                <label class="inline mini">
                  <input v-model="option.active" type="checkbox" />
                  <span>Visible</span>
                </label>
                <button class="ghost small" type="button" @click="removeOrHideOption(index)">
                  {{ hasExistingVotes && option.id && existingOptionIds.has(option.id) ? 'Ocultar' : 'Quitar' }}
                </button>
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="ghost" type="button" @click="addOption">Agregar opcion</button>
            <button class="primary" :disabled="savingSurvey" @click="saveSurvey">
              {{ savingSurvey ? 'Guardando...' : editingSurveyId ? 'Actualizar encuesta' : 'Crear encuesta' }}
            </button>
            <button class="ghost" :disabled="savingSurvey" @click="resetForm">Limpiar</button>
          </div>
        </article>
      </div>

      <article class="card list-card">
        <h2>Encuestas cargadas</h2>
        <p v-if="surveyStore.adminLoading">Cargando encuestas...</p>
        <p v-else-if="surveyStore.adminSurveys.length === 0">Aun no hay encuestas creadas.</p>

        <div v-else class="survey-list">
          <div v-for="survey in surveyStore.adminSurveys" :key="survey.id" class="survey-item">
            <div class="survey-main">
              <h3>{{ survey.question || 'Sin pregunta' }}</h3>
              <p>{{ survey.description || 'Sin descripcion' }}</p>
              <small>
                Estado <strong>{{ surveyStore.normalizeSurveyStatusForDisplay(survey) }}</strong> |
                Total votos {{ survey.totalVotes }}
              </small>
              <small>
                Opciones activas
                {{ survey.options.filter((option) => option.active).length }} /
                {{ survey.options.length }}
              </small>
            </div>

            <div class="survey-actions">
              <button class="ghost" @click="setFormFromSurvey(survey)">Editar</button>
              <button
                class="danger"
                :disabled="deletingSurveyId === survey.id"
                @click="deleteSurvey(survey.id)"
              >
                {{ deletingSurveyId === survey.id ? 'Eliminando...' : 'Eliminar' }}
              </button>
            </div>
          </div>
        </div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.surveys-page {
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

.option-list {
  display: grid;
  gap: 0.55rem;
}

.option-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.55rem;
  align-items: center;
}

.inline.mini {
  font-size: 0.82rem;
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

button.ghost.small {
  padding: 0.45rem 0.7rem;
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

.survey-list {
  display: grid;
  gap: 0.85rem;
}

.survey-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.85rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.survey-main h3 {
  margin: 0;
  color: var(--text-h);
}

.survey-main p {
  margin: 0.25rem 0 0.45rem;
  color: var(--text);
}

.survey-main small {
  display: block;
  color: var(--text);
}

.survey-actions {
  display: flex;
  gap: 0.45rem;
  align-items: flex-start;
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

  .option-item {
    grid-template-columns: 1fr;
  }

  .survey-item {
    flex-direction: column;
  }
}
</style>
