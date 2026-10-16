import { useEffect } from 'react';
import { maybeRequestReview } from './request-review';
import { noteWeekPlan } from './review-store';

// ─── Store rating prompt: where the success moments come from (ASO §5.1) ──────
// Food: meals are logged from ~10 places (tracker rows, Today cards, quick add,
// scan, cook mode …) and the shopping list is ticked from two screens, so the
// food trigger hangs off the query client's caches (src/lib/trpc.ts) instead
// of every call site: a successful `tracker.logRecipe` / `logCustomMeal`, or a
// `shoppingList.toggleItems` that ticks items, after a full week has been
// planned. "A full week" is noted from every week plan the cache sees.
// Gym: the workout summary (both shells) calls `useWorkoutReviewPrompt`.

const FOOD_LOG_PATHS = new Set(['tracker.logRecipe', 'tracker.logCustomMeal']);
const SHOPPING_TICK_PATH = 'shoppingList.toggleItems';

/** "tracker.logRecipe" from a tRPC query/mutation key (`[['tracker','logRecipe'], …]`). */
export function trpcPathOf(key: readonly unknown[] | undefined): string | null {
  const head = key?.[0];
  if (!Array.isArray(head) || !head.every((p) => typeof p === 'string')) return null;
  return head.join('.');
}

/** QueryCache `onSuccess`: a loaded week plan may be the user's first full week. */
export function reviewOnQuerySuccess(queryKey: readonly unknown[], data: unknown): void {
  try {
    if (trpcPathOf(queryKey)?.startsWith('mealPlan.')) noteWeekPlan(data);
  } catch {
    // ignore
  }
}

/** MutationCache `onSuccess`: plan writes note the week; logs and ticks are the food triggers. */
export function reviewOnMutationSuccess(
  mutationKey: readonly unknown[] | undefined,
  variables: unknown,
  data: unknown,
): void {
  try {
    const path = trpcPathOf(mutationKey);
    if (path === null) return;
    if (path.startsWith('mealPlan.')) {
      noteWeekPlan(data);
    } else if (FOOD_LOG_PATHS.has(path)) {
      maybeRequestReview('food_log');
    } else if (
      path === SHOPPING_TICK_PATH &&
      typeof variables === 'object' &&
      variables !== null &&
      (variables as { checked?: unknown }).checked === true
    ) {
      maybeRequestReview('shopping_tick');
    }
  } catch {
    // ignore
  }
}

/** The summary's trophy, tiles, PR card and confetti finish well inside this. */
export const WORKOUT_SUMMARY_SETTLE_MS = 3000;

const promptedWorkouts = new Set<string>();

/**
 * On the summary of a workout just finished in this session (`fresh` — not one
 * reopened from history): a PR, else the 3rd+ completed workout, may prompt.
 * Re-checked when the PRs arrive (they need the cached bootstrap); once a
 * request is scheduled for this workout it is never scheduled again.
 */
export function useWorkoutReviewPrompt(id: string, fresh: boolean, prCount: number): void {
  useEffect(() => {
    if (!fresh || promptedWorkouts.has(id)) return;
    const scheduled = maybeRequestReview(
      prCount > 0 ? 'gym_pr' : 'gym_third_workout',
      WORKOUT_SUMMARY_SETTLE_MS,
    );
    if (scheduled) promptedWorkouts.add(id);
  }, [id, fresh, prCount]);
}

/** Test seam. */
export function resetWorkoutReviewPromptsForTests(): void {
  promptedWorkouts.clear();
}
