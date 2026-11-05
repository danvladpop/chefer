import type { Translator } from '@chefer/i18n';
import type { ClientFoodDayDto, ClientWeekSummaryDto } from '@chefer/types';
import { showsKcal, showsProtein, type WeekSummaryLines } from '@chefer/utils';

// ─── Lane K2 lines in the UI language (Lane J phase 4) ────────────────────────
// `weekSummaryLines` / `foodDayParts` (@chefer/utils, coaching/food-share.ts)
// with the `coaching.trainer.data.*` catalog instead of the English
// COACHING_DATA_COPY. Same rules, line for line; the web has the same pair in
// apps/web/src/features/trainer/data-lines.ts.

type Tr = Pick<Translator, 't' | 'number'>;

/** The "Last 7 days" card as plain lines. */
export function weekSummaryLinesT(
  summary: ClientWeekSummaryDto,
  client: string,
  format: {
    weightKg: (kg: number, signed?: boolean) => string;
    date: (localDate: string) => string;
  },
  { t, number }: Tr,
): WeekSummaryLines {
  let food: string[] | null = null;
  if (summary.food) {
    const f = summary.food;
    food = [t('coaching.trainer.data.week.daysLogged', { days: f.daysLogged })];
    if (f.numbers === 'NONE') food.push(t('coaching.trainer.data.week.numbersHidden', { client }));
    if (f.avgKcal !== null) {
      food.push(
        f.targetKcal !== null
          ? t('coaching.trainer.data.week.avgKcal', {
              avg: number(f.avgKcal),
              target: number(f.targetKcal),
            })
          : t('coaching.trainer.data.week.avgKcalNoTarget', { avg: number(f.avgKcal) }),
      );
    } else if (!showsKcal(f.numbers) && showsProtein(f.numbers)) {
      // Protein only: the client hides calories.
      food.push(t('coaching.trainer.data.week.caloriesHidden', { client }));
    }
    if (f.avgProteinG !== null) {
      food.push(
        f.targetProteinG !== null
          ? t('coaching.trainer.data.week.avgProtein', {
              avg: number(f.avgProteinG),
              target: number(f.targetProteinG),
            })
          : t('coaching.trainer.data.week.avgProteinNoTarget', { avg: number(f.avgProteinG) }),
      );
    }
    food.push(
      f.planAdherence !== null
        ? t('coaching.trainer.data.week.plan', { pct: Math.round(f.planAdherence * 100) })
        : t('coaching.trainer.data.week.noPlan'),
    );
  }
  let weight: string[] | null = null;
  if (summary.weight) {
    const w = summary.weight;
    weight = w.latest
      ? [
          t('coaching.trainer.data.week.weightLatest', {
            weight: format.weightKg(w.latest.weightKg),
            date: format.date(w.latest.date),
          }),
          ...(w.changeKg === null
            ? []
            : Math.abs(w.changeKg) < 0.05
              ? [t('coaching.trainer.data.week.weightSteady')]
              : [
                  t('coaching.trainer.data.week.weightChange', {
                    change: format.weightKg(w.changeKg, true).replace('-', '−'),
                  }),
                ]),
        ]
      : [t('coaching.trainer.data.week.noWeighIn')];
  }
  const { done, goal } = summary.workouts;
  return {
    workouts:
      goal > 0
        ? t('coaching.trainer.data.week.workoutsOfGoal', { done, count: goal })
        : t('coaching.trainer.data.week.workouts', { count: done }),
    food,
    weight,
    notShared:
      !summary.sharing.food && !summary.sharing.weight
        ? {
            title: t('coaching.trainer.data.week.notShared', { client }),
            hint: t('coaching.trainer.data.week.notSharedHint'),
          }
        : null,
  };
}

/** One Food-tab day as parts ("3 meals", "1,850 / 2,000 kcal", "110 / 125 g protein", "2 of 3 planned"). */
export function foodDayPartsT(day: ClientFoodDayDto, { t, number }: Tr): string[] {
  if (day.mealsLogged === 0) return [t('coaching.trainer.data.food.nothingLogged')];
  return [
    t('coaching.trainer.data.food.meals', { count: day.mealsLogged }),
    ...(day.kcal !== null
      ? [
          day.targetKcal !== null
            ? t('coaching.trainer.data.food.kcal', {
                kcal: number(day.kcal),
                target: number(day.targetKcal),
              })
            : t('coaching.trainer.data.food.kcalNoTarget', { kcal: number(day.kcal) }),
        ]
      : []),
    ...(day.proteinG !== null
      ? [
          day.targetProteinG !== null
            ? t('coaching.trainer.data.food.protein', {
                g: number(day.proteinG),
                target: number(day.targetProteinG),
              })
            : t('coaching.trainer.data.food.proteinNoTarget', { g: number(day.proteinG) }),
        ]
      : []),
    ...(day.plan
      ? [
          t('coaching.trainer.data.food.plan', {
            eaten: day.plan.eaten,
            planned: day.plan.planned,
          }),
        ]
      : []),
  ];
}
