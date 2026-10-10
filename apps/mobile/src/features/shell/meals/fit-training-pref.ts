import { useSyncExternalStore } from 'react';

// T-06.7 "Fit meals to training days", new shell. The old Plan kept the
// choice in the Plan screen's state for the session and sent it with the
// next `mealPlan.generate` (it is not stored on the server). In the new shell
// the switch lives on the Meal settings screen and the generate call on
// Meals, so the same session-only value sits here between the two.
// `null` = never touched: on for an account with training days (legacy).

let value: boolean | null = null;
const listeners = new Set<() => void>();

export function getFitTrainingPref(): boolean | null {
  return value;
}

export function setFitTrainingPref(next: boolean): void {
  if (value === next) return;
  value = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The session's choice; `true` until the user turns it off (legacy default). */
export function useFitTrainingDays(): boolean {
  return useSyncExternalStore(subscribe, getFitTrainingPref, getFitTrainingPref) ?? true;
}

/** Tests: forget the session's choice. */
export function resetFitTrainingPrefForTests(): void {
  value = null;
}
