import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import type { GymBootstrap, ProgressionDto, SessionExerciseDoc, Suggestion } from '@chefer/types';
import { buildTrainerLines } from '../../src/features/coaching/logger-lines';
import { ExerciseCard, type WorkoutContext } from '../../src/features/gym/workout/exercise-card';
import { nextTimeRows, summaryFromDoc } from '../../src/features/gym/workout/summary-model';
import { WhySheet } from '../../src/features/gym/workout/workout-sheets';
import { makeBootstrap, makeExercise, profile } from './gym-fixtures';
import { activeDoc, safeAreaMetrics, suggestion } from './gym-workout-helpers';

// WP-18 lane D: the workout logger shows the trainer's cue under the exercise name ("Ana: knees out, slow
// eccentric") and "Set by Ana" on a trainer-set target (spec §2.6). Both come from the cached bootstrap at
// render time; an uncoached logger is unchanged.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

const bench = makeExercise('bench', 'Bench Press');
const handlers = {
  onTick: jest.fn(),
  onWeight: jest.fn(),
  onReps: jest.fn(),
  onOpenWeight: jest.fn(),
  onOpenReps: jest.fn(),
  onLongPress: jest.fn(),
};

const OVERRIDE: Suggestion = suggestion({
  kind: 'hold',
  weightKg: 62.5,
  reps: [6, 6, 6],
  reasonCode: 'USER_OVERRIDE',
});

function sessionExercise(overrides: Partial<SessionExerciseDoc> = {}): SessionExerciseDoc {
  const base = activeDoc().exercises[0];
  if (!base) throw new Error('fixture exercise');
  return { ...base, routineExerciseId: 're1', ...overrides };
}

function progression(overrides: Partial<ProgressionDto> = {}): ProgressionDto {
  return {
    exerciseId: 'bench',
    repBucket: '8-12',
    state: {} as ProgressionDto['state'],
    override: {
      weightKg: 62.5,
      reps: [6, 6, 6],
      at: '2026-10-02T09:00:00.000Z',
      setByName: 'Ana',
    },
    suggestion: OVERRIDE,
    ...overrides,
  };
}

function bootstrapWith(opts: {
  note?: string | null;
  progressions?: ProgressionDto[];
  coaching?: GymBootstrap['coaching'];
}): GymBootstrap {
  return makeBootstrap({
    coaching: opts.coaching === undefined ? { trainerName: 'Ana' } : opts.coaching,
    progressions: opts.progressions ?? [],
    activeRoutine: {
      id: 'r1',
      name: 'My Routine',
      templateKey: null,
      isActive: true,
      nextDayId: 'd1',
      version: 1,
      archived: false,
      updatedAt: '2026-10-02T09:00:00.000Z',
      days: [
        {
          id: 'd1',
          position: 0,
          name: 'Upper A',
          plannedWeekday: 0,
          exercises: [
            {
              id: 're1',
              exerciseId: 'bench',
              position: 0,
              sets: 3,
              repMin: 8,
              repMax: 12,
              targetRir: 2,
              restSec: 120,
              supersetGroup: null,
              notes: null,
              ...(opts.note !== undefined ? { trainerNote: opts.note } : {}),
            },
          ],
        },
      ],
    },
  });
}

function ctxWith(trainer: WorkoutContext['trainer']): WorkoutContext {
  return {
    unit: 'KG',
    profile,
    lookup: () => bench,
    prior: [],
    trainer,
    handlers,
    onSheet: jest.fn(),
    onToggle: jest.fn(),
    onRir: jest.fn(),
    onRirDismiss: jest.fn(),
    onSkip: jest.fn(),
    onAddSet: jest.fn(),
    onLayoutY: jest.fn(),
    onLogCardio: jest.fn(),
  };
}

describe('buildTrainerLines', () => {
  it('is null when the bootstrap carries no trainer information (uncoached, or API level 4)', () => {
    expect(buildTrainerLines(undefined, 'd1')).toBeNull();
    expect(buildTrainerLines(bootstrapWith({ coaching: null, progressions: [] }), 'd1')).toBeNull();
    expect(buildTrainerLines(bootstrapWith({ note: null }), 'd1')).toBeNull();
  });

  it('finds the note of the routine row the session exercise came from, with the trainer’s name', () => {
    const lines = buildTrainerLines(bootstrapWith({ note: 'Knees out, slow eccentric' }), 'd1');
    expect(lines?.trainerName).toBe('Ana');
    expect(lines?.noteFor(sessionExercise())).toBe('Knees out, slow eccentric');
    // A freestyle exercise, another day, or a one-off swap has no cue.
    expect(lines?.noteFor(sessionExercise({ routineExerciseId: null }))).toBeNull();
    expect(lines?.noteFor(sessionExercise({ routineExerciseId: 'other' }))).toBeNull();
    expect(lines?.noteFor(sessionExercise({ exerciseId: 'squat' }))).toBeNull();
    // Another day of the routine (or a freestyle session) has no rows with cues: nothing to show.
    expect(buildTrainerLines(bootstrapWith({ note: 'Knees out' }), 'd9')).toBeNull();
    expect(buildTrainerLines(bootstrapWith({ note: 'Knees out' }), null)).toBeNull();
  });

  it('keeps the note readable after the client left the trainer (name falls back)', () => {
    const lines = buildTrainerLines(bootstrapWith({ note: 'Pause', coaching: null }), 'd1');
    expect(lines?.trainerName).toBe('your trainer');
    expect(lines?.noteFor(sessionExercise())).toBe('Pause');
  });

  it('names who set a trainer target, only for a USER_OVERRIDE prescription of that bucket', () => {
    const lines = buildTrainerLines(bootstrapWith({ progressions: [progression()] }), 'd1');
    expect(lines?.setByFor(sessionExercise({ prescription: OVERRIDE }))).toBe('Ana');
    expect(lines?.setByFor(sessionExercise())).toBeNull(); // the app's own suggestion
    expect(lines?.setByFor(sessionExercise({ prescription: OVERRIDE, repMin: 5, repMax: 8 }))).toBe(
      null,
    );
  });

  it('a client-set target carries no setByName: nothing is attributed', () => {
    const own = progression({
      override: { weightKg: 62.5, reps: [6, 6, 6], at: '2026-10-02T09:00:00.000Z' },
    });
    expect(buildTrainerLines(bootstrapWith({ progressions: [own] }), 'd1')).toBeNull();
    // With a note present but only a client-set target, the target stays unattributed.
    const lines = buildTrainerLines(bootstrapWith({ note: 'Pause', progressions: [own] }), 'd1');
    expect(lines?.setByFor(sessionExercise({ prescription: OVERRIDE }))).toBeNull();
  });
});

describe('ExerciseCard with a trainer', () => {
  it('shows "Ana: <note>" under the exercise name', async () => {
    const lines = buildTrainerLines(bootstrapWith({ note: 'Knees out, slow eccentric' }), 'd1');
    await render(
      <ExerciseCard
        exercise={sessionExercise()}
        index={0}
        expanded
        isCurrent
        ctx={ctxWith(lines)}
      />,
    );
    expect(screen.getByTestId('exercise-0-trainer-note')).toHaveTextContent(
      'Ana: Knees out, slow eccentric',
    );
    // The client can remove it on the Routine tab, not here: no button in the logger.
    expect(screen.queryByTestId('exercise-0-trainer-note-remove')).toBeNull();
  });

  it('a trainer-set target reads "Set by Ana", not "Your own target"', async () => {
    const lines = buildTrainerLines(bootstrapWith({ progressions: [progression()] }), 'd1');
    await render(
      <ExerciseCard
        exercise={sessionExercise({ prescription: OVERRIDE })}
        index={0}
        expanded
        isCurrent
        ctx={ctxWith(lines)}
      />,
    );
    expect(screen.getByTestId('exercise-0-suggestion')).toHaveTextContent(/^Set by Ana: 62\.5 kg/);
  });

  it('an uncoached card has no trainer line and the old "Your own target" wording', async () => {
    await render(
      <ExerciseCard
        exercise={sessionExercise({ prescription: OVERRIDE })}
        index={0}
        expanded
        isCurrent
        ctx={ctxWith(null)}
      />,
    );
    expect(screen.queryByTestId('exercise-0-trainer-note')).toBeNull();
    expect(screen.getByTestId('exercise-0-suggestion')).toHaveTextContent(
      /^Your own target: 62\.5/,
    );
  });
});

describe('Why? sheet and summary', () => {
  it('Why? says "Set by Ana" in the sentence and the Rule row', async () => {
    await render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <WhySheet
          visible
          onClose={jest.fn()}
          exercise={sessionExercise({ prescription: OVERRIDE })}
          name="Bench Press"
          unit="KG"
          setBy="Ana"
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('why-sheet-sentence')).toHaveTextContent(/^Set by Ana: 62\.5 kg/);
    expect(screen.getByText('Set by Ana')).toBeOnTheScreen();
    expect(screen.queryByText('You set this target yourself')).toBeNull();
  });

  it('Why? without a trainer keeps "You set this target yourself"', async () => {
    await render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <WhySheet
          visible
          onClose={jest.fn()}
          exercise={sessionExercise({ prescription: OVERRIDE })}
          name="Bench Press"
          unit="KG"
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('You set this target yourself')).toBeOnTheScreen();
  });

  it('the summary’s "Next time" line names the trainer for a trainer-set target', () => {
    const doc = activeDoc();
    const view = summaryFromDoc(doc);
    const rows = nextTimeRows(
      { ...view, exercises: view.exercises.map((e) => ({ ...e, workingSets: 3, skipped: false })) },
      bootstrapWith({ progressions: [progression()] }),
    );
    expect(rows[0]?.sentence).toMatch(/^Set by Ana: 62\.5 kg/);
  });
});
