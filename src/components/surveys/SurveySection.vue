<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import { useSurveyStore, type Survey } from '@/stores/surveyStore';
import AuthPromptModal from '@/components/common/AuthPromptModal.vue';

const authStore = useAuthStore();
const surveyStore = useSurveyStore();
const props = withDefaults(
  defineProps<{
    mode?: 'list' | 'featured';
  }>(),
  {
    mode: 'list'
  }
);

const localSelections = ref<Record<string, string[]>>({});
const localErrors = ref<Record<string, string>>({});
const expandedOptionsBySurvey = ref<Record<string, boolean>>({});
const showSurveyLoginPrompt = ref(false);
const countdownNow = ref(Date.now());
const featuredSurveyIndex = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;
const MAX_VISIBLE_OPTIONS = 3;

const isFeaturedMode = computed(() => props.mode === 'featured');
const isAuthenticated = computed(() => authStore.isAuthenticated);
const featuredSurveys = computed(() => surveyStore.featuredActiveSurveys);
const surveysToRender = computed(() => {
  if (!isFeaturedMode.value) return surveyStore.publicSurveys;
  const activeFeatured = featuredSurveys.value;
  if (activeFeatured.length === 0) return [];

  const safeIndex = featuredSurveyIndex.value >= activeFeatured.length
    ? 0
    : Math.max(0, featuredSurveyIndex.value);

  return [activeFeatured[safeIndex]];
});
const isLoading = computed(() => {
  return isFeaturedMode.value ? surveyStore.featuredLoading : surveyStore.publicLoading;
});
const showSection = computed(() => {
  if (!isFeaturedMode.value) return true;
  return isLoading.value || surveysToRender.value.length > 0;
});
const canCycleFeaturedSurveys = computed(() => {
  return isFeaturedMode.value && featuredSurveys.value.length > 1;
});

const getStatus = (survey: Survey) => surveyStore.normalizeSurveyStatusForDisplay(survey);

const getStatusLabel = (survey: Survey): string => {
  const status = getStatus(survey);
  if (status === 'active') return 'Activa';
  if (status === 'inactive') return 'Inactiva';
  return 'Finalizada';
};

const getStatusClass = (survey: Survey): string => {
  const status = getStatus(survey);
  return `status-${status}`;
};

const getCountdownLabel = (survey: Survey): string => {
  if (getStatus(survey) !== 'active') return 'Finalizada';
  if (!survey.expiresAt) return 'Sin limite';

  const diffMs = survey.expiresAt.getTime() - countdownNow.value;
  if (diffMs <= 0) return 'Finalizando...';

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const canVote = (survey: Survey): boolean => {
  return isAuthenticated.value &&
    getStatus(survey) === 'active' &&
    !surveyStore.hasUserVoted(survey.id);
};

const getCurrentSelection = (survey: Survey): string[] => {
  if (surveyStore.hasUserVoted(survey.id)) {
    return surveyStore.getUserVoteOptionIds(survey.id);
  }
  return localSelections.value[survey.id] || [];
};

const setSelection = (surveyId: string, optionIds: string[]) => {
  localSelections.value = {
    ...localSelections.value,
    [surveyId]: optionIds
  };
};

const toggleSingleChoice = async (survey: Survey, optionId: string) => {
  if (!canVote(survey)) return;
  setSelection(survey.id, [optionId]);
  await submitVote(survey);
};

const toggleMultipleChoice = (survey: Survey, optionId: string) => {
  if (!canVote(survey)) return;
  const current = new Set(localSelections.value[survey.id] || []);

  if (current.has(optionId)) {
    current.delete(optionId);
  } else if (current.size < survey.maxVotesPerUser) {
    current.add(optionId);
  }

  setSelection(survey.id, Array.from(current));
};

const isOptionSelected = (survey: Survey, optionId: string): boolean => {
  return getCurrentSelection(survey).includes(optionId);
};

const getVotePercentage = (survey: Survey, voteCount: number): number => {
  if (survey.totalVotes <= 0) return 0;
  return Math.round((voteCount / survey.totalVotes) * 100);
};

const getActiveOptions = (survey: Survey) => {
  return survey.options.filter((item) => item.active);
};

const isOptionsExpanded = (surveyId: string): boolean => {
  return Boolean(expandedOptionsBySurvey.value[surveyId]);
};

const getVisibleOptions = (survey: Survey) => {
  const activeOptions = getActiveOptions(survey);
  if (activeOptions.length <= MAX_VISIBLE_OPTIONS) return activeOptions;
  if (isOptionsExpanded(survey.id)) return activeOptions;
  return activeOptions.slice(0, MAX_VISIBLE_OPTIONS);
};

const getHiddenOptionsCount = (survey: Survey): number => {
  const count = getActiveOptions(survey).length - MAX_VISIBLE_OPTIONS;
  return count > 0 ? count : 0;
};

const hasHiddenOptions = (survey: Survey): boolean => {
  return getHiddenOptionsCount(survey) > 0;
};

const toggleOptionsExpanded = (surveyId: string) => {
  expandedOptionsBySurvey.value = {
    ...expandedOptionsBySurvey.value,
    [surveyId]: !isOptionsExpanded(surveyId)
  };
};

const clearLocalError = (surveyId: string) => {
  if (!localErrors.value[surveyId]) return;
  const next = { ...localErrors.value };
  delete next[surveyId];
  localErrors.value = next;
};

const setLocalError = (surveyId: string, message: string) => {
  localErrors.value = {
    ...localErrors.value,
    [surveyId]: message
  };
};

const promptLoginToVote = () => {
  showSurveyLoginPrompt.value = true;
};

const closeSurveyLoginPrompt = () => {
  showSurveyLoginPrompt.value = false;
};

const handleOptionClick = async (survey: Survey) => {
  if (isAuthenticated.value) return;
  if (getStatus(survey) !== 'active') return;
  promptLoginToVote();
};

const goToNextFeaturedSurvey = () => {
  if (!canCycleFeaturedSurveys.value) return;
  const total = featuredSurveys.value.length;
  if (total <= 1) return;
  featuredSurveyIndex.value = (featuredSurveyIndex.value + 1) % total;
};

const submitVote = async (survey: Survey) => {
  if (!isAuthenticated.value) {
    promptLoginToVote();
    return;
  }
  clearLocalError(survey.id);

  const selectedOptionIds = localSelections.value[survey.id] || [];
  if (selectedOptionIds.length === 0) {
    setLocalError(survey.id, 'Selecciona una opcion para votar.');
    return;
  }

  try {
    await surveyStore.submitVote(survey.id, selectedOptionIds);
    const nextSelections = { ...localSelections.value };
    delete nextSelections[survey.id];
    localSelections.value = nextSelections;
  } catch (error: any) {
    setLocalError(
      survey.id,
      error?.message || 'No se pudo registrar tu voto. Intenta nuevamente.'
    );
  }
};

onMounted(() => {
  const tickMs = isFeaturedMode.value ? 1000 : 10000;
  countdownTimer = setInterval(() => {
    countdownNow.value = Date.now();
  }, tickMs);

  if (!isFeaturedMode.value) {
    surveyStore.initPublicSurveysListener();
  }
  surveyStore.initUserVotesListener();
});

watch(
  featuredSurveys,
  (list) => {
    if (!isFeaturedMode.value) return;
    if (list.length === 0) {
      featuredSurveyIndex.value = 0;
      return;
    }

    if (featuredSurveyIndex.value >= list.length) {
      featuredSurveyIndex.value = 0;
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  if (!isFeaturedMode.value) {
    surveyStore.cleanupPublicSurveys();
  }
});
</script>

<template>
  <section v-if="showSection" class="survey-section" :class="{ featured: isFeaturedMode }">


    <div v-if="!isLoading && !isFeaturedMode && surveysToRender.length === 0" class="survey-empty">
      <h3>No hay encuestas disponibles</h3>
      <p>Cuando el staff publique una encuesta aparecera aqui en tiempo real.</p>
    </div>

    <div v-else-if="!isLoading" class="survey-list">
      <article
        v-for="survey in surveysToRender"
        :key="survey.id"
        class="survey-card"
      >
        <header class="survey-head">
          <div>
            <h3>{{ survey.question }}</h3>
            <p v-if="survey.description" class="survey-description">{{ survey.description }}</p>
          </div>
          <span :class="['survey-status', getStatusClass(survey)]">
            {{ getStatusLabel(survey) }}
          </span>
        </header>

        <div class="survey-meta">
          <span>{{ survey.totalVotes }} votos</span>
          <span>Tiempo restante: <strong class="countdown-value">{{ getCountdownLabel(survey) }}</strong></span>
        </div>

        <div class="survey-options">
          <label
            v-for="option in getVisibleOptions(survey)"
            :key="`${survey.id}_${option.id}`"
            class="survey-option"
            :class="{ selected: isOptionSelected(survey, option.id) }"
            @click="handleOptionClick(survey)"
          >
            <div class="option-row">
              <template v-if="canVote(survey)">
                <input
                  v-if="!survey.isMultipleChoice"
                  type="radio"
                  :name="`survey_${survey.id}`"
                  :checked="isOptionSelected(survey, option.id)"
                  @change="toggleSingleChoice(survey, option.id)"
                />
                <input
                  v-else
                  type="checkbox"
                  :checked="isOptionSelected(survey, option.id)"
                  @change="toggleMultipleChoice(survey, option.id)"
                />
              </template>

              <span class="option-text">{{ option.text }}</span>
              <strong class="option-votes">{{ option.voteCount }}</strong>
            </div>

            <div class="option-bar">
              <div
                class="option-bar-fill"
                :style="{ width: `${getVotePercentage(survey, option.voteCount)}%` }"
              ></div>
            </div>

            <small>{{ getVotePercentage(survey, option.voteCount) }}%</small>
          </label>
        </div>

        <div v-if="hasHiddenOptions(survey)" class="options-toggle-wrap">
          <button
            class="more-options-btn"
            type="button"
            @click="toggleOptionsExpanded(survey.id)"
          >
            {{
              isOptionsExpanded(survey.id)
                ? 'Ver menos opciones'
                : `Ver mas opciones (+${getHiddenOptionsCount(survey)})`
            }}
          </button>
        </div>

        <footer class="survey-actions">
          <button
            v-if="canVote(survey) && survey.isMultipleChoice"
            class="vote-btn"
            :disabled="surveyStore.isVoteSubmitting(survey.id)"
            @click="submitVote(survey)"
          >
            {{
              surveyStore.isVoteSubmitting(survey.id)
                ? 'Registrando voto...'
                : 'Votar'
            }}
          </button>

          <p
            v-else-if="canVote(survey) && !survey.isMultipleChoice"
            class="survey-hint"
          >
            Selecciona una opcion para votar automaticamente.
          </p>

          <p
            v-else-if="!isAuthenticated && getStatus(survey) === 'active'"
            class="survey-hint"
          >
            Inicia sesion para votar. Los resultados son publicos.
          </p>

          <p v-else-if="surveyStore.hasUserVoted(survey.id)" class="survey-hint">
            Tu voto ya fue registrado.
          </p>
        </footer>

        <p v-if="localErrors[survey.id]" class="survey-error">{{ localErrors[survey.id] }}</p>
      </article>

      <div v-if="canCycleFeaturedSurveys" class="featured-nav">
        <span class="featured-counter">
          Encuesta {{ featuredSurveyIndex + 1 }} de {{ featuredSurveys.length }}
        </span>
        <button class="more-btn" type="button" @click="goToNextFeaturedSurvey">
          Siguiente encuesta
        </button>
      </div>

      <div v-if="!isFeaturedMode" class="survey-more">
        <button
          v-if="surveyStore.publicHasMore"
          class="more-btn"
          :disabled="surveyStore.publicLoadingMore"
          @click="surveyStore.loadMorePublicSurveys()"
        >
          {{ surveyStore.publicLoadingMore ? 'Cargando...' : 'Ver mas encuestas' }}
        </button>
      </div>
    </div>

    <AuthPromptModal
      :open="showSurveyLoginPrompt"
      title="Inicia sesion para participar"
      message="Con tu cuenta puedes votar en encuestas y guardar tu participacion."
      @close="closeSurveyLoginPrompt"
    />
  </section>
</template>

<style scoped>
.survey-section {
  margin-top: 0.5rem;
}
.survey-section.featured {
  margin-top: 0;
  margin-bottom: 1rem;
}

.survey-loading,
.survey-empty {
  text-align: center;
  padding: 2rem 1rem;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--card-bg);
}

.survey-empty h3 {
  color: var(--text-h);
  margin-bottom: 0.4rem;
}

.survey-empty p {
  color: var(--text);
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

.survey-list {
  display: grid;
  gap: 1rem;
}

.survey-card {
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--card-bg);
  padding: 1rem;
}

.survey-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.survey-head h3 {
  margin: 0;
  color: var(--text-h);
}

.survey-description {
  margin: 0.35rem 0 0;
  color: var(--text);
}

.survey-status {
  flex-shrink: 0;
  align-self: flex-start;
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  text-transform: uppercase;
}

.survey-status.status-active {
  background: #e8f7ee;
  color: #166534;
}

.survey-status.status-inactive {
  background: #f3f4f6;
  color: #4b5563;
}

.survey-status.status-completed {
  background: #eef2ff;
  color: #3730a3;
}

.survey-meta {
  margin-top: 0.7rem;
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: var(--text);
}

.countdown-value {
  font-weight: 800;
  color: var(--text-h);
}

.survey-options {
  margin-top: 0.85rem;
  display: grid;
  gap: 0.6rem;
}

.options-toggle-wrap {
  margin-top: 0.55rem;
}

.more-options-btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
  padding: 0.42rem 0.75rem;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.survey-option {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.6rem 0.7rem;
  background: var(--bg);
}

.survey-option.selected {
  border-color: var(--accent);
  background: var(--accent-bg);
}

.option-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.option-text {
  flex: 1;
  color: var(--text-h);
}

.option-votes {
  color: var(--text-h);
  font-size: 0.85rem;
}

.option-bar {
  margin-top: 0.45rem;
  width: 100%;
  height: 7px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--border);
}

.option-bar-fill {
  height: 100%;
  background: var(--accent);
}

.survey-option small {
  display: block;
  margin-top: 0.28rem;
  color: var(--text);
  font-size: 0.75rem;
}

.survey-actions {
  margin-top: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.vote-btn {
  border: 0;
  background: var(--accent);
  color: #fff;
  padding: 0.55rem 1rem;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.vote-btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.survey-hint {
  color: var(--text);
  margin: 0;
  font-size: 0.88rem;
}

.survey-error {
  margin: 0.7rem 0 0;
  color: #991b1b;
  font-weight: 600;
  font-size: 0.85rem;
}

.survey-more {
  text-align: center;
}

.featured-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
}

.featured-counter {
  color: var(--text);
  font-size: 0.86rem;
  font-weight: 600;
}

.more-btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
  padding: 0.55rem 1rem;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.more-btn:disabled {
  opacity: 0.7;
  cursor: default;
}

</style>
