import type {
  EventMap,
  WorkoutImportExerciseRowDto,
  WorkoutImportResultDto,
  WorkoutImportSource,
} from '@chefer/types';

// ─── Workout import copy (G2), shared by web and the future mobile screen ─────
// Mobile needs a file picker the current binary lacks (lane C,
// mobile_parity_backlog.md); the words and rules live here so the port is UI only.

export const WORKOUT_IMPORT_SOURCE_LABELS: Record<WorkoutImportSource, string> = {
  STRONG: 'Strong',
  HEVY: 'Hevy',
};

export const WORKOUT_IMPORT_COPY = {
  title: 'Import workouts',
  intro:
    'Bring your history from Strong or Hevy. Imported workouts count toward your PRs, strength charts and next suggestions.',
  howTo: {
    STRONG: 'In Strong: Profile → Settings → Export data. Save the CSV file.',
    HEVY: 'In Hevy: Profile → Settings → Export & import data → Export workouts.',
  } satisfies Record<WorkoutImportSource, string>,
  chooseFile: 'Choose your CSV file',
  reading: 'Reading your file…',
  unitQuestion: 'Were these weights in kilograms or pounds?',
  unitWhy: 'This older Strong file doesn’t say which unit it uses.',
  reviewTitle: 'Check your exercises',
  needsAttention: 'Check these',
  matchedAuto: 'Matched automatically',
  createOwn: 'Create as my own exercise',
  pickOther: 'Pick another exercise…',
  skip: 'Don’t import',
  mainMuscle: 'Main muscle',
  importing: 'Importing…',
  nothingNew: 'Nothing new to import',
  allThere: 'Every workout in this file is already in Chefer.',
  invalid: {
    empty: 'That file is empty.',
    unknown_format:
      'That file doesn’t look like a Strong or Hevy workout export. Export your workouts as CSV and try again.',
    no_workouts: 'We couldn’t find any workouts in that file.',
  },
  tooBig:
    'That file is too big to import in one go (5 MB). Export a shorter period and import it in parts.',
  tooSoon: 'You’ve imported a few times just now. Try again in 10 minutes.',
  failed: 'Couldn’t import right now. Please try again.',
} as const;

/** "Push ☀️ · 12 sets in 4 workouts" style line for a review row. */
export function importRowDetail(
  row: Pick<WorkoutImportExerciseRowDto, 'sets' | 'workouts'>,
): string {
  const sets = `${row.sets} ${row.sets === 1 ? 'set' : 'sets'}`;
  const workouts = `${row.workouts} ${row.workouts === 1 ? 'workout' : 'workouts'}`;
  return `${sets} in ${workouts}`;
}

/** The done screen's headline. */
export function importResultHeadline(result: WorkoutImportResultDto): string {
  if (result.imported === 0) return WORKOUT_IMPORT_COPY.allThere;
  const n = result.imported;
  return `Imported ${n} ${n === 1 ? 'workout' : 'workouts'} from ${WORKOUT_IMPORT_SOURCE_LABELS[result.source]}.`;
}

/** The done screen's detail lines (only the ones that apply). */
export function importResultDetails(result: WorkoutImportResultDto): string[] {
  const lines: string[] = [];
  if (result.createdExercises > 0) {
    const n = result.createdExercises;
    lines.push(`${n} new ${n === 1 ? 'exercise was' : 'exercises were'} added to your library.`);
  }
  if (result.imported > 0 && result.alreadyImported > 0) {
    lines.push(`${result.alreadyImported} were already in Chefer and were left as they are.`);
  }
  if (result.skippedWorkouts > 0) {
    const n = result.skippedWorkouts;
    lines.push(
      `${n} ${n === 1 ? 'workout had' : 'workouts had'} only exercises you chose not to import.`,
    );
  }
  if (result.trimmedSets > 0) {
    lines.push(`${result.trimmedSets} sets beyond 20 per exercise were left out.`);
  }
  return lines;
}

type WorkoutsBucket = EventMap['workout_import_completed']['workoutsBucket'];

/** A coarse count for the `workout_import_completed` event — never the exact number. */
export function importWorkoutsBucket(n: number): WorkoutsBucket {
  if (n <= 0) return '0';
  if (n <= 10) return '1-10';
  if (n <= 50) return '11-50';
  if (n <= 200) return '51-200';
  return '201+';
}
