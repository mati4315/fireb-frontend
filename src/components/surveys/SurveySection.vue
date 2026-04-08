<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import { useSurveyStore, type Survey } from '@/stores/surveyStore';

const router = useRouter();
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

const isFeaturedMode = computed(() => props.mode === 'featured');
const isAuthenticated = computed(() => authStore.isAuthenticated);
const surveysToRender = computed(() => {
  if (!isFeaturedMode.value) return surveyStore.publicSurveys;
  return surveyStore.featuredSurvey ? [surveyStore.featuredSurvey] : [];
});
const isLoading = computed(() => {
  return isFeaturedMode.value ? surveyStore.featuredLoading : surveyStore.publicLoading;
});
const showSection = computed(() => {
  if (!isFeaturedMode.value) return true;
  return isLoading.value || surveysToRender.value.length > 0;
});

const formatDate = (value: Date | null): string => {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(value);
};

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

const toggleSingleChoice = (survey: Survey, optionId: string) => {
  if (!canVote(survey)) return;
  setSelection(survey.id, [optionId]);
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

const submitVote = async (survey: Survey) => {
  if (!isAuthenticated.value) {
    await router.push('/login');
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
  if (isFeaturedMode.value) {
    surveyStore.initFeaturedSurveyListener();
  } else {
    surveyStore.initPublicSurveysListener();
  }
  surveyStore.initUserVotesListener();
});

onBeforeUnmount(() => {
  if (isFeaturedMode.value) {
    surveyStore.cleanupFeaturedSurvey();
  } else {
    surveyStore.cleanupPublicSurveys();
  }
});
</script>

<template>
  <section v-if="showSection" class="survey-section" :class="{ featured: isFeaturedMode }">
    <div v-if="isLoading" class="survey-loading">
      <div class="spinner"></div>
      <p>Cargando encuestas...</p>
    </div>

    <div v-else-if="!isFeaturedMode && surveysToRender.length === 0" class="survey-empty">
      <h3>No hay encuestas disponibles</h3>
      <p>Cuando el staff publique una encuesta aparecera aqui en tiempo real.</p>
    </div>

    <div v-else class="survey-list">
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
          <span v-if="survey.expiresAt">Cierra: {{ formatDate(survey.expiresAt) }}</span>
        </div>

        <div class="survey-options">
          <label
            v-for="option in survey.options.filter((item) => item.active)"
            :key="`${survey.id}_${option.id}`"
            class="survey-option"
            :class="{ selected: isOptionSelected(survey, option.id) }"
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

        <footer class="survey-actions">
          <button
            v-if="canVote(survey)"
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

.survey-options {
  margin-top: 0.85rem;
  display: grid;
  gap: 0.6rem;
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
