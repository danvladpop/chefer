// UX-COOK-02: where the cook left off, per recipe, for this app session.
//
// Leaving cook mode (the close button, Android BACK, the iOS swipe) used to
// throw the step and the ingredient ticks away, so re-entering started at step
// 1 with an empty checklist. The screen mirrors both into this in-memory store
// as they change and reads them back on mount. Deliberately NOT on disk: it is
// a "welcome back" for the kitchen, not a draft — a cold start is a new cook.
// Cleared when the recipe is finished.
//
// UX-COOK-01: the step timers (absolute `endsAt`) and the ids of their
// scheduled "timer done" notifications ride along, so a pot left simmering
// still counts down — and can still be cancelled — after leaving and returning.

import type { CookTimer } from '@chefer/utils';

export interface CookSession {
  /** Zero-based current step. */
  step: number;
  /** Ingredient indexes ticked off, ascending. */
  checked: number[];
  /** Step timers by zero-based step (absent: none ever started). */
  timers?: Record<number, CookTimer>;
  /** Scheduled end-of-timer notification ids by step. */
  notifications?: Record<number, string>;
}

/** Recipes remembered at once; the least recently touched one is dropped first. */
const MAX_REMEMBERED = 10;

const sessions = new Map<string, CookSession>();

export function getCookSession(recipeId: string): CookSession {
  const hit = sessions.get(recipeId);
  if (!hit) return { step: 0, checked: [] };
  return {
    step: hit.step,
    checked: [...hit.checked],
    ...(hit.timers && { timers: { ...hit.timers } }),
    ...(hit.notifications && { notifications: { ...hit.notifications } }),
  };
}

/** Remembers the position. Step 0 with nothing ticked is "not started": nothing is kept. */
export function saveCookSession(recipeId: string, session: CookSession): void {
  sessions.delete(recipeId);
  const hasTimers = Object.keys(session.timers ?? {}).length > 0;
  if (session.step <= 0 && session.checked.length === 0 && !hasTimers) return;
  sessions.set(recipeId, {
    step: Math.max(0, session.step),
    checked: [...session.checked].sort((a, b) => a - b),
    ...(hasTimers && session.timers && { timers: { ...session.timers } }),
    ...(session.notifications && { notifications: { ...session.notifications } }),
  });
  while (sessions.size > MAX_REMEMBERED) {
    const oldest = sessions.keys().next();
    if (oldest.done) break;
    sessions.delete(oldest.value);
  }
}

export function clearCookSession(recipeId: string): void {
  sessions.delete(recipeId);
}

/** Test seam. */
export function resetCookSessionsForTests(): void {
  sessions.clear();
}
