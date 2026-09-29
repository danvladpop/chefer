import { describe, expect, it } from 'vitest';
import { EXERCISE_BY_ID, type ExerciseDto } from '@chefer/types';
import { filterExercises as filterRoutine } from '../routine/exercise-filter';
import { cardioSetText, isCardioExercise, profileDistanceUnit } from './cardio';
import { filterExercises as filterPicker } from './exercise-picker-sheet';

// T-42.5 (UX-42, Q-31): the web renders cardio as time · distance · effort and
// never offers it in a picker (it can't log it).

const run = EXERCISE_BY_ID.get('outdoor-run');
const rower = EXERCISE_BY_ID.get('rowing-machine');
const bench = EXERCISE_BY_ID.get('barbell-bench-press');

describe('cardio on the web', () => {
  it('knows which catalogue exercises are cardio', () => {
    expect(isCardioExercise(run)).toBe(true);
    expect(isCardioExercise(bench)).toBe(false);
    expect(isCardioExercise(undefined)).toBe(false);
  });

  it('reads a set as time · distance · effort, never "0 kg × 0"', () => {
    const text = cardioSetText(
      { durationSec: 20 * 60, distanceM: 5000, intensityRpe: 5 },
      'outdoor-run',
      'KM',
    );
    expect(text).toBe('20 min · 5 km · Moderate');
    expect(text).not.toMatch(/kg|×/);
  });

  it('shows the rower in metres regardless of the profile unit, and only what was logged', () => {
    expect(cardioSetText({ durationSec: 600, distanceM: 2000 }, 'rowing-machine', 'MI')).toMatch(
      /^10 min · 2,?000 m$/,
    );
    expect(cardioSetText({}, 'outdoor-run', 'KM')).toBe('—');
  });

  it('follows the profile distance unit, else km/mi from the weight unit', () => {
    expect(profileDistanceUnit({ unit: 'LB', distanceUnit: null })).toBe('MI');
    expect(profileDistanceUnit({ unit: 'KG', distanceUnit: null })).toBe('KM');
    expect(profileDistanceUnit({ unit: 'KG', distanceUnit: 'MI' })).toBe('MI');
    expect(profileDistanceUnit(null)).toBe('KM');
  });

  it('both exercise pickers exclude cardio (render-only until web logging exists)', () => {
    const library = [run, rower, bench].filter((e): e is NonNullable<typeof e> => e !== undefined);
    const dto = library as unknown as ExerciseDto[];
    const names = (rows: ExerciseDto[]) => rows.map((e) => e.id);
    expect(names(filterPicker(dto, { query: '', group: null }))).toEqual(['barbell-bench-press']);
    expect(names(filterRoutine(dto, { query: '', group: null }))).toEqual(['barbell-bench-press']);
  });
});
