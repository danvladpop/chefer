import type { PlanMealSlotJson } from '@chefer/database';

// ─── Regenerate keeps what already happened (UX-PLAN-01) ──────────────────────
// A mid-week regenerate used to replace all 21 meals, including the days that
// were over and the dinner the user had already eaten and logged — the plan
// then no longer matched the log, and Today offered a second dinner. The
// current week's regeneration now keeps (a) every past day exactly as it was
// and (b) any of today's slots whose recipe was logged; only today's
// uneaten slots and the days after it are replaced. Pure functions — the
// service supplies the clock, the existing plan and the log.

/** What a regenerate must carry over from the plan it replaces. */
export type KeptDay = {
  dayOfWeek: number;
  /** A past day: the whole day is kept (its meals replace the new ones). */
  whole: boolean;
  /** The existing slots to keep (a whole day's slots, or today's eaten ones). */
  slots: PlanMealSlotJson[];
};

/**
 * The slots of `existingDays` a regenerate must keep, for a week whose
 * "today" is `todayIndex` (0 = Monday). Days after today keep nothing.
 */
export function selectKeptSlots(
  existingDays: readonly { dayOfWeek: number; meals: unknown }[],
  todayIndex: number,
  /** Recipe ids logged today; null when unknown (keep all of today's slots). */
  loggedToday: ReadonlySet<string> | null,
): KeptDay[] {
  const kept: KeptDay[] = [];
  for (const day of existingDays) {
    const meals = (Array.isArray(day.meals) ? day.meals : []) as PlanMealSlotJson[];
    if (day.dayOfWeek < todayIndex) {
      kept.push({ dayOfWeek: day.dayOfWeek, whole: true, slots: meals });
    } else if (day.dayOfWeek === todayIndex) {
      const slots = loggedToday ? meals.filter((m) => loggedToday.has(m.recipeId)) : meals;
      if (slots.length > 0) kept.push({ dayOfWeek: day.dayOfWeek, whole: false, slots });
    }
  }
  return kept;
}

const TYPE_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];
const rank = (type: string): number => {
  const i = TYPE_ORDER.indexOf(type);
  return i === -1 ? TYPE_ORDER.length : i;
};

/**
 * Lays the kept slots over a freshly generated week. A whole kept day
 * replaces the new day's meals; for today, each kept slot takes the place of
 * the new day's first not-yet-replaced slot of the same type (so there is
 * never a second dinner), or is added when the new day has none.
 * `toMeal` rebuilds a slot in the caller's meal shape and returns null when
 * it cannot (missing recipe row) — that slot is simply not kept.
 */
export function mergeKeptSlots<M extends { type: string }, D extends { meals: M[] }>(
  days: readonly (D & { dayOfWeek: number })[],
  kept: readonly KeptDay[],
  toMeal: (slot: PlanMealSlotJson) => M | null,
): { days: (D & { dayOfWeek: number })[]; wholeKept: Set<number> } {
  const wholeKept = new Set<number>();
  const merged = days.map((day) => {
    const keep = kept.find((k) => k.dayOfWeek === day.dayOfWeek);
    if (!keep) return day;
    const keptMeals = keep.slots.flatMap((slot) => {
      const meal = toMeal(slot);
      return meal ? [meal] : [];
    });
    if (keep.whole) {
      wholeKept.add(day.dayOfWeek);
      return { ...day, meals: keptMeals };
    }
    const meals = [...day.meals];
    const taken = new Set<M>();
    for (const meal of keptMeals) {
      const at = meals.findIndex((m) => m.type === meal.type && !taken.has(m));
      if (at !== -1) {
        meals[at] = meal;
      } else {
        // The new day has no slot of this type: add it in day order.
        const before = meals.findIndex((m) => rank(m.type) > rank(meal.type));
        meals.splice(before === -1 ? meals.length : before, 0, meal);
      }
      taken.add(meal);
    }
    return { ...day, meals };
  });
  return { days: merged, wholeKept };
}
