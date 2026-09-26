import { useCallback, useEffect, useState } from 'react';

// ─── Shared recipe create/edit form logic (audit F-REC-3-7) ───────────────────
// Validation that is identical on /recipes/new and /recipes/[id]/edit, plus the
// error plumbing both forms need: clear an error as soon as its field changes,
// and on a failed submit move focus (and scroll) to the first invalid field —
// the user is sitting at the Save button while the errors are at the top.

export const RECIPE_FORM_ERROR_KEYS = [
  'name',
  'description',
  'cuisineType',
  'prepTimeMins',
  'cookTimeMins',
  'servings',
  'ingredients',
  'instructions',
  'calories',
] as const;

/** Keys in the order their fields appear on the page (drives first-invalid focus). */
export type RecipeFormErrorKey = (typeof RECIPE_FORM_ERROR_KEYS)[number];
export type RecipeFormErrors = Partial<Record<RecipeFormErrorKey, string>>;
/** Element id to focus for each error key. Keys without a target are skipped. */
export type RecipeFormFocusTargets = Partial<Record<RecipeFormErrorKey, string>>;

export type RecipeCoreValues = {
  name: string;
  description: string;
  prepTimeMins: string;
  cookTimeMins: string;
  servings: string;
  instructions: string[];
};

function isWholeNumber(raw: string, min: number): boolean {
  if (raw.trim() === '') return false;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min;
}

/** Validation shared by the create and edit forms. Page-specific rules are merged on top. */
export function validateRecipeCore(values: RecipeCoreValues): RecipeFormErrors {
  const errs: RecipeFormErrors = {};
  if (!values.name.trim()) errs.name = 'Recipe name is required.';
  if (!values.description.trim()) errs.description = 'Description is required.';
  if (!isWholeNumber(values.prepTimeMins, 0)) errs.prepTimeMins = 'Whole minutes, 0 or more.';
  if (!isWholeNumber(values.cookTimeMins, 0)) errs.cookTimeMins = 'Whole minutes, 0 or more.';
  if (!isWholeNumber(values.servings, 1)) errs.servings = 'Whole number, 1 or more.';
  if (values.instructions.every((s) => !s.trim()))
    errs.instructions = 'Add at least one instruction step.';
  return errs;
}

/** The id of the first (in page order) field that has an error and a focus target. */
export function firstInvalidTarget(
  errors: RecipeFormErrors,
  targets: RecipeFormFocusTargets,
): string | null {
  for (const key of RECIPE_FORM_ERROR_KEYS) {
    const target = targets[key];
    if (errors[key] && target) return target;
  }
  return null;
}

/** Scrolls a field to the middle of the viewport (clear of the sticky header) and focuses it. */
export function focusFieldById(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  if (typeof el.scrollIntoView === 'function') {
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  el.focus({ preventScroll: true });
  return true;
}

/** Id of the error message element for a field / section id. */
export const errorIdFor = (id: string) => `${id}-error`;

/** aria-invalid + aria-describedby for a control whose error text lives at `errorIdFor(id)`. */
export function fieldErrorProps(
  describedById: string,
  error: string | undefined,
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  return error ? { 'aria-invalid': true, 'aria-describedby': errorIdFor(describedById) } : {};
}

/**
 * Error state for the recipe forms. `report` sets the errors and, after React
 * has rendered them (so aria-describedby resolves), focuses the first invalid
 * field. `clear` drops one key when the user edits that field.
 */
export function useRecipeFormErrors() {
  const [errors, setErrors] = useState<RecipeFormErrors>({});
  // Wrapped in an object so reporting the same target twice still refocuses.
  const [pendingFocus, setPendingFocus] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (!pendingFocus) return;
    focusFieldById(pendingFocus.id);
    setPendingFocus(null);
  }, [pendingFocus]);

  const clear = useCallback((key: RecipeFormErrorKey) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next: RecipeFormErrors = {};
      for (const k of RECIPE_FORM_ERROR_KEYS) {
        if (k !== key && prev[k]) next[k] = prev[k];
      }
      return next;
    });
  }, []);

  /** Returns true when the form is valid. */
  const report = useCallback((errs: RecipeFormErrors, targets: RecipeFormFocusTargets) => {
    setErrors(errs);
    const target = firstInvalidTarget(errs, targets);
    if (target) setPendingFocus({ id: target });
    return Object.keys(errs).length === 0;
  }, []);

  return { errors, clear, report };
}
