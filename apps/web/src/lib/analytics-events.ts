import { capture } from '@/lib/analytics';
import { planSlotSchema, type EventMap } from '@chefer/types';

// ─── Beta funnel call-site helpers (UX-PO-02, web twin of the phone's) ────────
// Thin wrappers so each screen adds ONE line and the property shaping (only
// counts and enum values — never a recipe name, food text or id) lives, and is
// tested, in one place. Everything goes through `capture()`, so the
// "Send anonymous usage counts" switch (consent gate) applies unchanged. Shapes
// are the shared `EventMap` (`packages/types/src/analytics-events.ts`).

type MealLoggedSource = EventMap['meal_logged']['source'];

/** `meal_logged` — `mealType` is sent only when it is one of the four plan slots. */
export function trackMealLogged(source: MealLoggedSource, mealType: string | undefined): void {
  const slot = planSlotSchema.safeParse(mealType);
  capture('meal_logged', slot.success ? { source, mealType: slot.data } : { source });
}

/** `onboarding_completed` — `trainingStyles` only when the user picked any. */
export function trackOnboardingCompleted(
  jobs: readonly string[],
  trainingStyles: readonly string[],
): void {
  capture('onboarding_completed', trainingStyles.length > 0 ? { jobs, trainingStyles } : { jobs });
}

type SharingWhere = EventMap['coaching_sharing_changed']['where'];

/** `coaching_sharing_changed` (lane K1) — one event per switch that changed. */
export function trackSharingChanged(
  change: { food?: boolean | undefined; weight?: boolean | undefined },
  where: SharingWhere,
): void {
  if (change.food !== undefined)
    capture('coaching_sharing_changed', { data: 'food', on: change.food, where });
  if (change.weight !== undefined) {
    capture('coaching_sharing_changed', { data: 'weight', on: change.weight, where });
  }
}

/** At join / request time: one event per switch the client turned ON (both start off). */
export function trackSharingChosen(
  share: { food: boolean; weight: boolean } | undefined,
  where: 'join' | 'request',
): void {
  trackSharingChanged(
    { ...(share?.food && { food: true }), ...(share?.weight && { weight: true }) },
    where,
  );
}
