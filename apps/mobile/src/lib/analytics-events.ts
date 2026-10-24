import { planSlotSchema, type EventMap } from '@chefer/types';
import { track } from './analytics';

// ─── Beta funnel call-site helpers (WP-13, UX-PO-02) ───────────────────────────
// Thin wrappers so each screen adds ONE line and the property shaping (only
// counts and enum values — never a recipe name, food text or id) lives, and is
// tested, in one place. Everything goes through `track()`, so the
// "Send anonymous usage counts" switch and the no-key no-op apply unchanged.

type MealLoggedSource = EventMap['meal_logged']['source'];

/** `meal_logged` — `mealType` is sent only when it is one of the four plan slots. */
export function trackMealLogged(source: MealLoggedSource, mealType: string | undefined): void {
  const slot = planSlotSchema.safeParse(mealType);
  track('meal_logged', slot.success ? { source, mealType: slot.data } : { source });
}

type PlanWithMeals = { days: readonly { meals: readonly unknown[] }[] };

/** `plan_generated` — `slotsCount` is the meals in the week, `keptPicks` the pinned meals carried over. */
export function trackPlanGenerated(plan: PlanWithMeals, keptPicks: number): void {
  const slotsCount = plan.days.reduce((n, day) => n + day.meals.length, 0);
  track('plan_generated', { slotsCount, keptPicks });
}

/** `onboarding_completed` — `trainingStyles` only when the user picked any. */
export function trackOnboardingCompleted(
  jobs: readonly string[],
  trainingStyles: readonly string[],
): void {
  track('onboarding_completed', trainingStyles.length > 0 ? { jobs, trainingStyles } : { jobs });
}

type SharingWhere = EventMap['coaching_sharing_changed']['where'];

/**
 * `coaching_sharing_changed` (lane K1) — one event per switch that changed. At join / request time
 * only the switches turned ON are sent (both start off, so an untouched switch is no change).
 */
export function trackSharingChanged(
  change: { food?: boolean | undefined; weight?: boolean | undefined },
  where: SharingWhere,
): void {
  if (change.food !== undefined)
    track('coaching_sharing_changed', { data: 'food', on: change.food, where });
  if (change.weight !== undefined) {
    track('coaching_sharing_changed', { data: 'weight', on: change.weight, where });
  }
}

/** At join / request time: one `coaching_sharing_changed` per switch the client turned ON. */
export function trackSharingChosen(
  share: { food: boolean; weight: boolean } | undefined,
  where: 'join' | 'request',
): void {
  trackSharingChanged(
    { ...(share?.food && { food: true }), ...(share?.weight && { weight: true }) },
    where,
  );
}
