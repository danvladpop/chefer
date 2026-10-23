import type { RouterOutputs } from '../../lib/trpc';
import { mealTypeLabel } from '../shell/today/today-helpers';

// The home-screen widget (C4) shows what Today already shows: the next planned
// meal and what is left of today's targets. The app writes this snapshot after
// each Today load; the widget only displays its strings, so wording changes
// ship over OTA. Kept minimal on purpose (App Group / shared prefs, readable by
// anything on the home screen): no weights, no allergies, no account details.

type Summary = RouterOutputs['dashboard']['summary'];

export interface TodayWidgetSnapshot {
  v: 1;
  /** Local YYYY-MM-DD it describes; the widget says "Open Chefer" on any other day. */
  date: string;
  /** "Next · Lunch", "Tomorrow · Breakfast", or "Today". */
  eyebrow: string;
  /** The recipe, or a nudge when nothing is planned. */
  title: string;
  /** "820 kcal · 64 g protein left"; null when numbers are hidden. */
  detail: string | null;
  /** Opens Today. */
  url: string;
}

function leftLine(d: Summary): string | null {
  if (!d.showNutrition) return null;
  // WP-16 / lane E3 "hide numbers" (stored as NONE): a home screen is the most
  // public surface we have, so it shows no numbers even before the in-app mode
  // ships (effectiveNumbersMode still maps NONE to FULL inside the app).
  if (d.numbersMode === 'NONE') return null;
  const n = d.nutrition;
  const target = n.adjustedTargets ?? {
    dailyCalorieTarget: n.dailyCalorieTarget,
    proteinG: n.protein.targetG,
  };
  const proteinLeft = Math.max(0, Math.round(target.proteinG - n.protein.eaten));
  const protein = `${proteinLeft} g protein left`;
  if (d.numbersMode === 'PROTEIN_ONLY') return protein;
  const kcalLeft = Math.max(0, Math.round(target.dailyCalorieTarget - n.eatenKcal));
  return `${kcalLeft.toLocaleString('en-US')} kcal · ${protein}`;
}

/** Pure: the snapshot for today's dashboard summary. */
export function buildTodayWidgetSnapshot(
  d: Summary,
  date: string,
  url: string,
): TodayWidgetSnapshot {
  const detail = leftLine(d);
  if (d.nextMeal) {
    return {
      v: 1,
      date,
      eyebrow: `Next · ${mealTypeLabel(d.nextMeal.mealType)}`,
      title: d.nextMeal.recipe.name,
      detail,
      url,
    };
  }
  if (d.tomorrowFirstMeal) {
    return {
      v: 1,
      date,
      eyebrow: `Tomorrow · ${mealTypeLabel(d.tomorrowFirstMeal.mealType)}`,
      title: d.tomorrowFirstMeal.recipe.name,
      detail,
      url,
    };
  }
  return {
    v: 1,
    date,
    eyebrow: 'Today',
    title: d.weekPlan.length > 0 ? 'No more meals planned' : 'Plan your week in Chefer',
    detail,
    url,
  };
}
