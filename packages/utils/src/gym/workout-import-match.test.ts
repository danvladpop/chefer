import { describe, expect, it } from 'vitest';
import { EXERCISE_CATALOG } from '@chefer/types';
import {
  ImportExerciseMatcher,
  importReviewRows,
  normalizeExerciseName,
  type ImportLibraryExercise,
} from './workout-import-match';

// G2: the names Strong and Hevy users actually have (from real exports) land
// on the right Chefer exercise, and anything doubtful is asked, not guessed.

const curated: ImportLibraryExercise[] = EXERCISE_CATALOG.map((e) => ({
  id: e.id,
  name: e.name,
  aliases: e.aliases,
  equipment: e.equipment,
  primaryMuscles: e.primaryMuscles,
  custom: false,
}));
const matcher = new ImportExerciseMatcher(curated);
const matched = (name: string) => {
  const m = matcher.match(name);
  return m.status === 'matched' ? m.exerciseId : `${m.status}:${m.exerciseId ?? ''}`;
};

describe('normalizeExerciseName', () => {
  it('folds punctuation, case, plurals and spelling variants', () => {
    expect(normalizeExerciseName('Pull-Up')).toBe('pull up');
    expect(normalizeExerciseName('Bicep Curls')).toBe('biceps curl');
    expect(normalizeExerciseName("Farmer's Walk")).toBe('farmer walk');
    expect(normalizeExerciseName('Skullcrushers')).toBe('skull crusher');
  });
});

describe('ImportExerciseMatcher — common names map with certainty', () => {
  it.each([
    // Strong
    ['Squat (Barbell)', 'back-squat'],
    ['Bench Press (Barbell)', 'barbell-bench-press'],
    ['Bench Press (Dumbbell)', 'dumbbell-bench-press'],
    ['Deadlift (Barbell)', 'deadlift'],
    ['Overhead Press (Barbell)', 'overhead-press'],
    ['Bent Over Row (Barbell)', 'barbell-row'],
    ['Romanian Deadlift (Barbell)', 'romanian-deadlift'],
    ['Romanian Deadlift (Dumbbell)', 'dumbbell-romanian-deadlift'],
    ['Front Squat (Barbell)', 'front-squat'],
    ['Incline Bench Press (Barbell)', 'incline-barbell-bench-press'],
    ['Incline Bench Press (Dumbbell)', 'incline-dumbbell-press'],
    ['Bench Press - Close Grip (Barbell)', 'close-grip-bench-press'],
    ['Trap Bar Deadlift', 'trap-bar-deadlift'],
    ['Hip Thrust (Barbell)', 'hip-thrust'],
    ['Bulgarian Split Squat', 'bulgarian-split-squat'],
    ['Leg Press', 'leg-press'],
    ['Leg Extension (Machine)', 'leg-extension'],
    ['Seated Leg Curl (Machine)', 'seated-leg-curl'],
    ['Seated Calf Raise (Plate Loaded)', 'seated-calf-raise'],
    ['Pull Up', 'pull-up'],
    ['Pull Up (Assisted)', 'assisted-pull-up'],
    ['Chin Up', 'chin-up'],
    ['Lat Pulldown (Cable)', 'lat-pulldown'],
    ['Lat Pulldown - Wide Grip (Cable)', 'lat-pulldown'],
    ['Lat Pulldown - Close Grip (Cable)', 'close-grip-lat-pulldown'],
    ['Seated Row (Cable)', 'seated-cable-row'],
    ['Face Pull (Cable)', 'face-pull'],
    ['Bicep Curl (Barbell)', 'barbell-curl'],
    ['Bicep Curl (Dumbbell)', 'dumbbell-curl'],
    ['Hammer Curl (Dumbbell)', 'hammer-curl'],
    ['Incline Curl (Dumbbell)', 'incline-dumbbell-curl'],
    ['Triceps Pushdown (Cable - Straight Bar)', 'triceps-pushdown'],
    ['Skullcrusher (Barbell)', 'skull-crusher'],
    ['Triceps Dip', 'triceps-dip'],
    ['Chest Dip', 'chest-dip'],
    ['Chest Fly (Dumbbell)', 'dumbbell-fly'],
    ['Pec Deck (Machine)', 'pec-deck'],
    ['Lateral Raise (Dumbbell)', 'dumbbell-lateral-raise'],
    ['Lateral Raise (Machine)', 'machine-lateral-raise'],
    ['Front Raise (Dumbbell)', 'dumbbell-front-raise'],
    ['Shrug (Dumbbell)', 'dumbbell-shrug'],
    ['Push Up', 'push-up'],
    ['Plank', 'plank'],
    ['Crunch (Machine)', 'ab-crunch-machine'],
    ['Cable Crunch', 'cable-crunch'],
    ["Knee Raise (Captain's Chair)", 'captains-chair-knee-raise'],
    ['Hanging Knee Raise', 'hanging-knee-raise'],
    ['Running', 'running'],
    ['Walking', 'walking'],
    ['Swimming', 'swimming'],
    // Hevy
    ['Incline Bench Press (Smith Machine)', 'smith-machine-incline-press'],
    ['Chest Press (Machine)', 'machine-chest-press'],
    ['Butterfly (Pec Deck)', 'pec-deck'],
    ['Squat (Smith Machine)', 'smith-machine-squat'],
    ['Hack Squat (Machine)', 'hack-squat'],
    ['Leg Press (Machine)', 'leg-press'],
    ['Lying Leg Curl (Machine)', 'lying-leg-curl'],
    ['Hip Abduction (Machine)', 'hip-abduction-machine'],
    ['Shoulder Press (Dumbbell)', 'seated-dumbbell-shoulder-press'],
    ['Seated Shoulder Press (Machine)', 'machine-shoulder-press'],
    ['Lat Pulldown (Machine)', 'lat-pulldown'],
    ['Seated Cable Row - V Grip (Cable)', 'seated-cable-row'],
    ['Dumbbell Row', 'single-arm-dumbbell-row'],
    ['Iso-Lateral Row (Machine)', 'machine-row'],
    ['Pull Up (Weighted)', 'pull-up'],
    ['Bicep Curl (Cable)', 'cable-biceps-curl'],
    ['Preacher Curl (Barbell)', 'preacher-curl'],
    ['EZ Bar Biceps Curl', 'ez-bar-curl'],
    ['Triceps Pushdown', 'triceps-pushdown'],
    ['Triceps Rope Pushdown', 'rope-triceps-pushdown'],
    ['Overhead Triceps Extension (Cable)', 'overhead-cable-triceps-extension'],
    ['Triceps Dip (Assisted)', 'assisted-dip'],
    ['Face Pull', 'face-pull'],
    ['Hanging Leg Raise', 'hanging-leg-raise'],
    ['Crunch', 'crunch'],
    ['Cycling', 'outdoor-cycle'],
  ])('%s → %s', (name, id) => {
    expect(matched(name)).toBe(id);
  });

  it('prefers the user’s own exercise of the same name (a previous import)', () => {
    const own = new ImportExerciseMatcher([
      ...curated,
      {
        id: 'u-1',
        name: 'Hand Gripper',
        aliases: [],
        equipment: 'BODYWEIGHT',
        primaryMuscles: ['forearms'],
        custom: true,
      },
    ]);
    expect(own.match('Hand Gripper')).toMatchObject({ status: 'matched', exerciseId: 'u-1' });
  });
});

describe('ImportExerciseMatcher — doubtful names are asked, not guessed', () => {
  it('never maps a dumbbell movement onto the barbell exercise by name alone', () => {
    // "Upright Row" exists only with a barbell in the catalog.
    expect(matcher.match('Upright Row (Dumbbell)').status).not.toBe('matched');
  });

  it('suggests close names and offers alternatives', () => {
    // An exact alias ("Incline Chest Press Machine") is certain…
    expect(matched('Incline Chest Press (Machine)')).toBe('incline-machine-chest-press');
    // …a movement Chefer only has a cousin of is a suggestion.
    const m = matcher.match('Decline Chest Press (Machine)');
    expect(m.status).toBe('suggested');
    expect(m.exerciseId).toBe('machine-chest-press');
    expect(m.alternatives.length).toBeGreaterThan(0);
  });

  it('leaves a movement Chefer lacks unmatched', () => {
    expect(matcher.match('Zercher Carry (Barbell)').status).toBe('unmatched');
    expect(matcher.match('Hand Gripper').status).toBe('unmatched');
  });
});

describe('importReviewRows', () => {
  it('one row per name, most sets first, with kind and a muscle for "create"', () => {
    const rows = importReviewRows(
      [
        {
          exercises: [
            {
              name: 'Squat (Barbell)',
              notes: null,
              sets: [
                {
                  kind: 'normal',
                  weightKg: 100,
                  reps: 5,
                  distanceM: null,
                  durationSec: null,
                  rpe: null,
                },
              ],
            },
            {
              name: 'Hand Gripper',
              notes: null,
              sets: [
                {
                  kind: 'normal',
                  weightKg: 30,
                  reps: 20,
                  distanceM: null,
                  durationSec: null,
                  rpe: null,
                },
              ],
            },
          ],
        },
        {
          exercises: [
            {
              name: 'Squat (Barbell)',
              notes: null,
              sets: [
                {
                  kind: 'normal',
                  weightKg: 100,
                  reps: 5,
                  distanceM: null,
                  durationSec: null,
                  rpe: null,
                },
              ],
            },
            {
              name: 'Side Plank',
              notes: null,
              sets: [
                {
                  kind: 'normal',
                  weightKg: 0,
                  reps: null,
                  distanceM: null,
                  durationSec: 30,
                  rpe: null,
                },
              ],
            },
            {
              name: 'Running',
              notes: null,
              sets: [
                {
                  kind: 'normal',
                  weightKg: 0,
                  reps: null,
                  distanceM: 5000,
                  durationSec: 1500,
                  rpe: null,
                },
              ],
            },
          ],
        },
      ],
      matcher,
    );
    expect(rows.map((r) => [r.name, r.sets, r.workouts, r.kind, r.status, r.exerciseName])).toEqual(
      [
        ['Squat (Barbell)', 2, 2, 'strength', 'matched', 'Back Squat'],
        ['Hand Gripper', 1, 1, 'strength', 'unmatched', null],
        ['Running', 1, 1, 'cardio', 'matched', 'Running'],
        ['Side Plank', 1, 1, 'timed', 'matched', 'Side Plank'],
      ],
    );
    expect(rows.find((r) => r.name === 'Hand Gripper')?.suggestedMuscle).toBe('forearms');
  });
});
