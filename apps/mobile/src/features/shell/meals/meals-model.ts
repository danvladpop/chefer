import type { DayStripDay } from '@chefer/ui-mobile';
import {
  conflictHeadline,
  conflictText,
  formatPortion,
  planMealNutritionLabel,
  slotPortion,
  weekdayLongName,
  weekdayShortName,
  type ConflictLike,
} from '@chefer/utils';

// Pure helpers behind the new shell's Meals tab (10 Oct redesign, board
// "Plan"): the day strip, a tile's label / meta / badge and the one safety
// line. The maths is the legacy Plan's (`sumPlanDay`, `planMealMacros`,
// portions) — only the wording is new.

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

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The seven DayStrip buttons for the week starting `monday`. */
export function weekStripDays(monday: Date, todayIndex: number | null): DayStripDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      key: String(index),
      weekday: weekdayShortName(index),
      date: date.getDate(),
      accessibilityLabel: `${weekdayLongName(index)} ${date.getDate()} ${MONTHS_LONG[date.getMonth()] ?? ''}`,
      isToday: todayIndex === index,
    };
  });
}

const MEAL_LABELS: Readonly<Record<string, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/** "Breakfast" for a meal type (unknown types get their own word, capitalised). */
export function mealTypeLabel(mealType: string): string {
  return MEAL_LABELS[mealType] ?? mealType.charAt(0).toUpperCase() + mealType.slice(1);
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
export function mealTileLabel(mealType: string, isSide: boolean): string {
  return isSide ? 'Side' : mealTypeLabel(mealType);
}

/**
 * The tile's one meta line. Main dish: "615 kcal · 10 min", "760 kcal · pinned",
 * "920 kcal · 1½× portion · 20 min", "480 kcal · leftovers". A side names the
 * meal it belongs to: "Dinner · 120 kcal". Protein-only mode shows protein.
 */
export function mealTileMeta(meal: TileMeal, isSide: boolean, proteinOnly: boolean): string {
  const nutrition = planMealNutritionLabel(meal.recipe.nutritionInfo, meal.portion, proteinOnly);
  if (isSide) return `${mealTypeLabel(meal.type)} · ${nutrition}`;
  const portion = slotPortion(meal.portion);
  const minutes = Math.max(0, Math.round(meal.recipe.prepTimeMins + meal.recipe.cookTimeMins));
  const tail = meal.pinned ? 'pinned' : meal.leftoverOf ? 'leftovers' : `${minutes} min`;
  return [nutrition, portion !== 1 ? `${formatPortion(portion)} portion` : null, tail]
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
function listLabels(labels: readonly string[]): string {
  const shown = labels.slice(0, 3);
  const rest = labels.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  if (shown.length <= 1) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/**
 * The one safety line under the meals (owner decision 10 Oct: one line, the
 * full text on tap): "Checked for peanuts and shellfish. Always read labels."
 * Allergies and diets count; dislikes are taste, not safety.
 */
export function mealsSafetyLine(tableSafety: TableSafetyLike | null | undefined): string {
  if (!tableSafety?.hasRules) return 'Meal ideas, not medical advice. Always read labels.';
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
  if (labels.length === 0) return 'Checked for your table. Always read labels.';
  return `Checked for ${listLabels(labels)}. Always read labels.`;
}
