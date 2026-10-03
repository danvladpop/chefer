// UX-REC-04: the recipe page deletes and navigates to the cookbook, so the
// Undo offer travels through sessionStorage (same handoff as the swap undo)
// and is honoured only briefly.

const KEY = 'chefer.last-recipe-delete';
export const RECIPE_DELETE_UNDO_WINDOW_MS = 10_000;

export interface RecipeDeleteUndo {
  recipeId: string;
  name: string;
  ts: number;
}

export function writeRecipeDeleteUndo(entry: Omit<RecipeDeleteUndo, 'ts'>, now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...entry, ts: now }));
  } catch {
    // Storage blocked: the delete still happened, there is just no Undo offer.
  }
}

/** Reads (and clears) a fresh Undo offer; null when absent, stale or malformed. */
export function takeRecipeDeleteUndo(now = Date.now()): RecipeDeleteUndo | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const entry = JSON.parse(raw) as Partial<RecipeDeleteUndo>;
    if (
      typeof entry.recipeId !== 'string' ||
      typeof entry.name !== 'string' ||
      typeof entry.ts !== 'number' ||
      now - entry.ts > RECIPE_DELETE_UNDO_WINDOW_MS
    ) {
      return null;
    }
    return { recipeId: entry.recipeId, name: entry.name, ts: entry.ts };
  } catch {
    return null;
  }
}
