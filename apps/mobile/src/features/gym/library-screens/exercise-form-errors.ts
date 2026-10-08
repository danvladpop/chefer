import type { ValidationIssueLike } from '../validation-copy';

// UX-GYM-21: the custom-exercise form used to print every Zod message in one
// block at the bottom ("Array must contain at least 1 element(s)"). These
// helpers file each schema issue under the field it belongs to, with a plain
// sentence, so the error appears next to the thing to fix.

export const EXERCISE_NAME_MAX = 60;
export const EXERCISE_NAME_MIN = 2;
export const EXERCISE_CUE_MAX = 120;
export const MAX_PRIMARY_MUSCLES = 4;
export const MAX_SECONDARY_MUSCLES = 6;

export type ExerciseFormField =
  | 'name'
  | 'primaryMuscles'
  | 'secondaryMuscles'
  | 'reps'
  | 'rest'
  | 'cues';

export type ExerciseFormErrors = {
  fields: Partial<Record<ExerciseFormField, string>>;
  /** Anything that does not belong to one field. */
  form: string | null;
};

const FORM_FALLBACK = 'Check the details above and try again.';

/** Files each schema issue under its field, with a plain-language message. */
export function exerciseFormErrors(issues: readonly ValidationIssueLike[]): ExerciseFormErrors {
  const fields: ExerciseFormErrors['fields'] = {};
  let form: string | null = null;
  const put = (field: ExerciseFormField, message: string) => {
    fields[field] ??= message;
  };
  for (const issue of issues) {
    const path: unknown[] = Array.isArray(issue.path) ? issue.path : [];
    const head = path[0];
    const tooBig = issue.code === 'too_big';
    switch (head) {
      case 'name':
        put(
          'name',
          tooBig
            ? `Keep the name to ${String(EXERCISE_NAME_MAX)} characters or fewer.`
            : `Give it a name of at least ${String(EXERCISE_NAME_MIN)} characters.`,
        );
        break;
      case 'primaryMuscles':
        put(
          'primaryMuscles',
          tooBig
            ? `Pick up to ${String(MAX_PRIMARY_MUSCLES)} primary muscles.`
            : 'Pick at least one primary muscle.',
        );
        break;
      case 'secondaryMuscles':
        put('secondaryMuscles', `Pick up to ${String(MAX_SECONDARY_MUSCLES)} secondary muscles.`);
        break;
      case 'repMin':
      case 'repMax':
        put('reps', 'Check the rep range: the minimum can’t be above the maximum.');
        break;
      case 'restSec':
        put('rest', 'Rest must be between 15 and 900 seconds.');
        break;
      case 'cues': {
        const index = typeof path[1] === 'number' ? path[1] + 1 : null;
        put(
          'cues',
          tooBig
            ? `${index === null ? 'A cue' : `Cue ${String(index)}`} is over ${String(EXERCISE_CUE_MAX)} characters.`
            : 'Remove empty cues or fill them in.',
        );
        break;
      }
      case undefined:
        // The schema's cross-field refine (repMin <= repMax) has an empty path.
        put('reps', 'Check the rep range: the minimum can’t be above the maximum.');
        break;
      default:
        form ??= FORM_FALLBACK;
    }
  }
  return { fields, form };
}
