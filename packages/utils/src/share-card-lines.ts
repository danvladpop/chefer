import type { ShareCardPayload } from '@chefer/types';

// ─── Share card wording (market review 2026-10, lane E2) ─────────────────────
// What a share card says, from its snapshotted payload: one eyebrow, one
// title and up to six stat rows. Shared by the web image (next/og), the public
// landing page and the in-app preview, so every surface says the same thing.
// Only what happened is shown: a zero count is left off the card, never
// printed as "0 workouts". Scanned by `chefer/no-forbidden-copy`.

export interface ShareCardLines {
  eyebrow: string;
  title: string;
  stats: { value: string; label: string }[];
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function recipeStats(payload: Extract<ShareCardPayload, { kind: 'recipe' | 'cook' }>) {
  const stats: ShareCardLines['stats'] = [];
  if (payload.totalMinutes)
    stats.push({ value: `${payload.totalMinutes} min`, label: 'start to finish' });
  if (payload.servings) {
    stats.push({
      value: String(payload.servings),
      label: plural(payload.servings, 'serving', 'servings'),
    });
  }
  if (payload.nutrition) {
    stats.push({ value: `${payload.nutrition.kcal} kcal`, label: 'per serving' });
    stats.push({ value: `${payload.nutrition.proteinG} g`, label: 'protein per serving' });
  }
  return stats;
}

export function shareCardLines(payload: ShareCardPayload): ShareCardLines {
  switch (payload.kind) {
    case 'recipe':
      return {
        eyebrow: 'From my Chefer kitchen',
        title: payload.title,
        stats: recipeStats(payload),
      };
    case 'cook':
      return {
        eyebrow: 'Cooked it with Chefer',
        title: payload.title,
        stats: recipeStats(payload),
      };
    case 'workout': {
      const stats: ShareCardLines['stats'] = [];
      for (const pr of payload.prs ?? [])
        stats.push({ value: pr.label, label: `New best: ${pr.exerciseName}` });
      if (payload.exercises > 0) {
        stats.push({
          value: String(payload.exercises),
          label: plural(payload.exercises, 'exercise', 'exercises'),
        });
      }
      if (payload.sets > 0)
        stats.push({ value: String(payload.sets), label: plural(payload.sets, 'set', 'sets') });
      if (payload.durationMin)
        stats.push({ value: `${payload.durationMin} min`, label: 'of training' });
      return { eyebrow: 'Workout done', title: payload.title, stats: stats.slice(0, 6) };
    }
    case 'recap': {
      const stats: ShareCardLines['stats'] = [];
      const { cooking, protein, training } = payload;
      if (cooking && cooking.cookedFromPlan > 0) {
        stats.push({
          value: String(cooking.cookedFromPlan),
          label: plural(
            cooking.cookedFromPlan,
            'meal cooked from my plan',
            'meals cooked from my plan',
          ),
        });
      }
      if (cooking && cooking.newRecipesTried > 0) {
        stats.push({
          value: String(cooking.newRecipesTried),
          label: plural(cooking.newRecipesTried, 'new recipe tried', 'new recipes tried'),
        });
      }
      if (protein && protein.hit > 0) {
        stats.push({
          value: `${protein.hit} of ${protein.logged}`,
          label: 'days at my protein goal',
        });
      }
      if (training && training.sessions > 0) {
        stats.push({
          value: String(training.sessions),
          label: plural(training.sessions, 'workout', 'workouts'),
        });
      }
      if (training && training.prCount > 0) {
        stats.push({
          value: String(training.prCount),
          label: plural(training.prCount, 'new personal best', 'new personal bests'),
        });
      }
      if (training && training.streakWeeks > 0) {
        stats.push({ value: `${training.streakWeeks}-week`, label: 'training streak' });
      }
      return { eyebrow: `My week · ${payload.label}`, title: 'Week in review', stats };
    }
  }
}
