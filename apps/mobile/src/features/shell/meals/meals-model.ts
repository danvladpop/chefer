import type { Translator } from '@chefer/i18n';
import type { DayStripDay } from '@chefer/ui-mobile';
import {
  conflictHeadline,
  conflictText,
  formatKcal,
  formatNumber,
  formatPortion,
  planMealMacros,
  slotPortion,
  type ConflictLike,
} from '@chefer/utils';

// Pure helpers behind the new shell's Meals tab (10 Oct redesign, board
// "Plan"): the day strip, a tile's label / meta / badge and the one safety
// line. The maths is the legacy Plan's (`sumPlanDay`, `planMealMacros`,
// portions) — only the wording is new. Every helper that returns text takes
// the screen's `t` (ADR 0004), so the words follow the UI language.

type T = Translator['t'];

export type WeekOffset = 0 | 1;

/** A route param as a whole number within [min, max], else null. */
export function intParam(
  value: string | string[] | undefined,
  min: number,
  max: number,
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Monday = 0 … Sunday = 6 for today. */
export function todayDayIndex(now: Date = new Date()): number {
  const jsDay = now.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

/** 0 → "Monday" in the UI language. */
export function weekdayName(t: T, dayOfWeek: number): string {
  const key = WEEKDAY_KEYS[dayOfWeek];
  return key ? t(`common.weekdays.${key}`) : '';
}

/** 0 → "Mon" in the UI language. */
export function weekdayShort(t: T, dayOfWeek: number): string {
  const key = WEEKDAY_KEYS[dayOfWeek];
  return key ? t(`common.weekdaysShort.${key}`) : '';
}

/** The seven DayStrip buttons for the week starting `monday`. */
export function weekStripDays(t: T, monday: Date, todayIndex: number | null): DayStripDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const month = MONTH_KEYS[date.getMonth()];
    return {
      key: String(index),
      weekday: weekdayShort(t, index),
      date: date.getDate(),
      accessibilityLabel: t('plan.meals.strip.dayLabel', {
        weekday: weekdayName(t, index),
        day: String(date.getDate()),
        month: month ? t(`plan.meals.strip.months.${month}`) : '',
      }),
      isToday: todayIndex === index,
    };
  });
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type KnownMealType = (typeof MEAL_TYPES)[number];
const isKnownMealType = (mealType: string): mealType is KnownMealType =>
  (MEAL_TYPES as readonly string[]).includes(mealType);

/** "Breakfast" for a meal type (unknown types get their own word, capitalised). */
export function mealTypeLabel(t: T, mealType: string): string {
  return isKnownMealType(mealType)
    ? t(`plan.mealTypes.${mealType}`)
    : mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

/** The meal type as it reads mid-sentence: "Change dinner". */
export function mealTypeWord(t: T, mealType: string): string {
  return mealTypeLabel(t, mealType).toLowerCase();
}

type TileMeal = {
  type: string;
  pinned?: boolean | null | undefined;
  portion?: number | null | undefined;
  leftoverOf?: string | null | undefined;
  recipe: {
    prepTimeMins: number;
    cookTimeMins: number;
    nutritionInfo: { calories?: number; protein?: number; carbs?: number; fat?: number };
    allergenWarnings?: string[] | null | undefined;
    safetyChecks?:
      | { conflicts?: string[] | undefined; conflictDetails?: readonly ConflictLike[] | undefined }
      | null
      | undefined;
  };
};

/** The frame label: the meal type, or "Side" for a second dish of the same meal. */
export function mealTileLabel(t: T, mealType: string, isSide: boolean): string {
  return isSide ? t('plan.meals.tile.side') : mealTypeLabel(t, mealType);
}

/**
 * The tile's one meta line. Main dish: "615 kcal · 10 min", "760 kcal · pinned",
 * "920 kcal · 1½× portion · 20 min", "480 kcal · leftovers". A side names the
 * meal it belongs to: "Dinner · 120 kcal". Protein-only mode shows protein.
 */
export function mealTileMeta(
  t: T,
  meal: TileMeal,
  isSide: boolean,
  proteinOnly: boolean,
  /** Lane E3 "Hide numbers": no nutrition figure, the portion always shows. */
  noNumbers = false,
): string {
  const macros = planMealMacros(meal.recipe.nutritionInfo, meal.portion);
  const nutrition = noNumbers
    ? null
    : proteinOnly
      ? t('plan.meals.tile.protein', { grams: formatNumber(macros.protein) })
      : t('plan.meals.tile.kcal', { kcal: formatKcal(macros.kcal) });
  if (isSide) return [mealTypeLabel(t, meal.type), nutrition].filter(Boolean).join(' · ');
  const portion = slotPortion(meal.portion);
  const minutes = Math.max(0, Math.round(meal.recipe.prepTimeMins + meal.recipe.cookTimeMins));
  const tail = meal.pinned
    ? t('plan.meals.tile.pinned')
    : meal.leftoverOf
      ? t('plan.meals.tile.leftovers')
      : t('plan.meals.tile.minutes', { minutes: String(minutes) });
  const amount = formatPortion(portion);
  return [
    nutrition,
    noNumbers
      ? t(portion > 1 ? 'plan.meals.tile.portionsCount' : 'plan.meals.tile.portionCount', {
          amount: amount.replace(/×$/, ''),
        })
      : portion !== 1
        ? t('plan.meals.tile.portion', { portion: amount })
        : null,
    tail,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The safety problem a planned dish has with the table, or null — "Contains
 * peanut" / "Not paleo: contains quinoa". A dish that fails the rules is never
 * shown silently (audit F-PLAN-1-7), even though the "checks passed" pills went.
 */
export function mealConflictText(meal: TileMeal): string | null {
  const warnings = meal.recipe.allergenWarnings ?? [];
  const details = meal.recipe.safetyChecks?.conflictDetails;
  if (warnings.length > 0) return conflictHeadline(warnings, details);
  const first = meal.recipe.safetyChecks?.conflicts?.[0];
  if (!first) return null;
  return conflictText(details?.find((d) => d.label === first) ?? { label: first });
}

type TableSafetyLike = {
  hasRules: boolean;
  people: readonly { items: readonly { label: string; kind: string }[] }[];
};

/** "peanuts", "peanuts and shellfish", "peanuts, shellfish and 2 more". */
function listLabels(t: T, labels: readonly string[]): string {
  const shown = labels.slice(0, 3);
  const rest = labels.length - shown.length;
  if (rest > 0) return t('plan.meals.safety.listMore', { list: shown.join(', '), count: rest });
  if (shown.length <= 1) return shown.join('');
  return t('plan.meals.safety.listAnd', {
    list: shown.slice(0, -1).join(', '),
    last: shown[shown.length - 1] ?? '',
  });
}

/**
 * The one safety line under the meals (owner decision 10 Oct: one line, the
 * full text on tap): "Checked for peanuts and shellfish. Always read labels."
 * Allergies and diets count; dislikes are taste, not safety.
 */
export function mealsSafetyLine(t: T, tableSafety: TableSafetyLike | null | undefined): string {
  if (!tableSafety?.hasRules) return t('plan.meals.safety.noRules');
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const person of tableSafety.people) {
    for (const item of person.items) {
      if (item.kind === 'dislike') continue;
      const label = item.label.trim().toLowerCase();
      if (label && !seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
  }
  if (labels.length === 0) return t('plan.meals.safety.table');
  return t('plan.meals.safety.checkedFor', { list: listLabels(t, labels) });
}
