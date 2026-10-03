// UX-COOK-02: where the cook left off, per recipe, for this app session.
//
// Leaving cook mode (the close button, Android BACK, the iOS swipe) used to
// throw the step and the ingredient ticks away, so re-entering started at step
// 1 with an empty checklist. The screen mirrors both into this in-memory store
// as they change and reads them back on mount. Deliberately NOT on disk: it is
// a "welcome back" for the kitchen, not a draft — a cold start is a new cook.
// Cleared when the recipe is finished.

export interface CookSession {
  /** Zero-based current step. */
  step: number;
  /** Ingredient indexes ticked off, ascending. */
  checked: number[];
}

/** Recipes remembered at once; the least recently touched one is dropped first. */
const MAX_REMEMBERED = 10;

const sessions = new Map<string, CookSession>();

export function getCookSession(recipeId: string): CookSession {
  const hit = sessions.get(recipeId);
  return hit ? { step: hit.step, checked: [...hit.checked] } : { step: 0, checked: [] };
}

/** Remembers the position. Step 0 with nothing ticked is "not started": nothing is kept. */
export function saveCookSession(recipeId: string, session: CookSession): void {
  sessions.delete(recipeId);
  if (session.step <= 0 && session.checked.length === 0) return;
  sessions.set(recipeId, {
    step: Math.max(0, session.step),
    checked: [...session.checked].sort((a, b) => a - b),
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
