// UX-GYM-21 (web twin of the phone's exercise-form-errors): the custom exercise
// form's name error is plain language, not the raw schema message ("String must
// contain at least 2 character(s)").

export const EXERCISE_NAME_MAX = 60;
export const EXERCISE_NAME_MIN = 2;

/** `type` is the react-hook-form / Zod issue code (`too_small`, `too_big`, …). */
export function exerciseNameError(type: string | undefined): string {
  return type === 'too_big'
    ? `Keep the name to ${String(EXERCISE_NAME_MAX)} characters or fewer.`
    : `Give it a name of at least ${String(EXERCISE_NAME_MIN)} characters.`;
}
