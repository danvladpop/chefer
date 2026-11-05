import type { Translator } from '@chefer/i18n';
import type { ShareCardPayload } from '@chefer/types';
import type { ShareCardLines } from '@chefer/utils';

// Lane J phase 4: `shareCardLines` (@chefer/utils share-card-lines.ts) in the
// reader's language, for the public /s/<id> page. Same rules: only what
// happened, a zero count is left off, never "0 workouts". The values a card
// snapshotted (titles, the week label, PR labels) stay as they were written.

type RecipePayload = Extract<ShareCardPayload, { kind: 'recipe' | 'cook' }>;

function recipeStats(payload: RecipePayload, t: Translator['t']): ShareCardLines['stats'] {
  const stats: ShareCardLines['stats'] = [];
  if (payload.totalMinutes) {
    stats.push({
      value: t('today.engagement.share.stats.minutes', { value: payload.totalMinutes }),
      label: t('today.engagement.share.stats.startToFinish'),
    });
  }
  if (payload.servings) {
    stats.push({
      value: String(payload.servings),
      label: t('today.engagement.share.stats.servings', { count: payload.servings }),
    });
  }
  if (payload.nutrition) {
    stats.push({
      value: t('today.engagement.share.stats.perServingValue.kcal', {
        value: payload.nutrition.kcal,
      }),
      label: t('today.engagement.share.stats.perServing'),
    });
    stats.push({
      value: t('today.engagement.share.stats.proteinGrams', { value: payload.nutrition.proteinG }),
      label: t('today.engagement.share.stats.proteinPerServing'),
    });
  }
  return stats;
}

export function shareCardText(payload: ShareCardPayload, t: Translator['t']): ShareCardLines {
  switch (payload.kind) {
    case 'recipe':
      return {
        eyebrow: t('today.engagement.share.eyebrow.recipe'),
        title: payload.title,
        stats: recipeStats(payload, t),
      };
    case 'cook':
      return {
        eyebrow: t('today.engagement.share.eyebrow.cook'),
        title: payload.title,
        stats: recipeStats(payload, t),
      };
    case 'workout': {
      const stats: ShareCardLines['stats'] = [];
      for (const pr of payload.prs ?? []) {
        stats.push({
          value: pr.label,
          label: t('today.engagement.share.stats.newBest', { exercise: pr.exerciseName }),
        });
      }
      if (payload.exercises > 0) {
        stats.push({
          value: String(payload.exercises),
          label: t('today.engagement.share.stats.exercises', { count: payload.exercises }),
        });
      }
      if (payload.sets > 0) {
        stats.push({
          value: String(payload.sets),
          label: t('today.engagement.share.stats.sets', { count: payload.sets }),
        });
      }
      if (payload.durationMin) {
        stats.push({
          value: t('today.engagement.share.stats.minutes', { value: payload.durationMin }),
          label: t('today.engagement.share.stats.ofTraining'),
        });
      }
      return {
        eyebrow: t('today.engagement.share.eyebrow.workout'),
        title: payload.title,
        stats: stats.slice(0, 6),
      };
    }
    case 'recap': {
      const stats: ShareCardLines['stats'] = [];
      const { cooking, protein, training } = payload;
      if (cooking && cooking.cookedFromPlan > 0) {
        stats.push({
          value: String(cooking.cookedFromPlan),
          label: t('today.engagement.share.stats.cookedFromPlan', {
            count: cooking.cookedFromPlan,
          }),
        });
      }
      if (cooking && cooking.newRecipesTried > 0) {
        stats.push({
          value: String(cooking.newRecipesTried),
          label: t('today.engagement.share.stats.newRecipesTried', {
            count: cooking.newRecipesTried,
          }),
        });
      }
      if (protein && protein.hit > 0) {
        stats.push({
          value: t('today.engagement.share.stats.proteinDaysValue', {
            hit: protein.hit,
            logged: protein.logged,
          }),
          label: t('today.engagement.share.stats.proteinDays'),
        });
      }
      if (training && training.sessions > 0) {
        stats.push({
          value: String(training.sessions),
          label: t('today.engagement.share.stats.workouts', { count: training.sessions }),
        });
      }
      if (training && training.prCount > 0) {
        stats.push({
          value: String(training.prCount),
          label: t('today.engagement.share.stats.prCount', { count: training.prCount }),
        });
      }
      if (training && training.streakWeeks > 0) {
        stats.push({
          value: t('today.engagement.share.stats.streakValue', { count: training.streakWeeks }),
          label: t('today.engagement.share.stats.streak'),
        });
      }
      return {
        eyebrow: t('today.engagement.share.eyebrow.recap', { week: payload.label }),
        title: t('today.engagement.share.recapTitle'),
        stats,
      };
    }
  }
}
