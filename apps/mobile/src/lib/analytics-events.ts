import { planSlotSchema, type EventMap } from '@chefer/types';
import { track } from './analytics';

// ─── Beta funnel call-site helpers (WP-13, UX-PO-02) ───────────────────────────
// Thin wrappers so each screen adds ONE line and the property shaping (only
// counts and enum values — never a recipe name, food text or id) lives, and is
// tested, in one place. Everything goes through `track()`, so the
// "Send anonymous usage counts" switch and the no-key no-op apply unchanged.

type MealLoggedSource = EventMap['meal_logged']['source'];
export type MealLogMethod = NonNullable<EventMap['meal_logged']['method']>;

/**
 * `meal_logged` — `mealType` is sent only when it is one of the four plan
 * slots; `method` (how the food was entered) only when the caller knows it.
 */
export function trackMealLogged(
  source: MealLoggedSource,
  mealType: string | undefined,
  method?: MealLogMethod,
): void {
  const slot = planSlotSchema.safeParse(mealType);
  track('meal_logged', {
    source,
    ...(slot.success && { mealType: slot.data }),
    ...(method && { method }),
  });
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

/** `list_item_checked` — after `shoppingList.toggleItems` succeeds; un-ticking sends nothing. */
export function trackListToggled(toggle: { keys: readonly string[]; checked: boolean }): void {
  if (toggle.checked && toggle.keys.length > 0) {
    track('list_item_checked', { items: toggle.keys.length });
  }
}
