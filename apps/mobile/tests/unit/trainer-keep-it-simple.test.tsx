import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import type { CoachedExerciseDto, TrainerRoutineDayDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import TrainerClientRoute from '../../app/trainer/[clientId]/index';
import TrainerRoutineRoute from '../../app/trainer/[clientId]/routine';
import TrainerHomeRoute from '../../app/trainer/index';
import {
  draftToTrainerRoutineDoc,
  routineDtoToDraft,
  trainerRoutineToDraft,
} from '../../src/features/gym/routine/mapping';
import { routineDraftReducer } from '../../src/features/gym/routine/reducer';
import { doneAsPlannedText, workoutTypeLine } from '../../src/features/trainer/format';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import {
  adherence,
  clientRow,
  LIBRARY,
  MARIA,
  settle,
  trainerHandlers,
  trainerRoutine,
  workout,
} from './trainer-fixtures';

// PRD 2026-10 §4.3 (last bullet): the trainer's view of a client who trains in "Keep it simple" —
// the badge and hint (no control to change the style), "Done as planned" instead of lifted numbers,
// "Yoga · 45 min" for a typed workout, and My week workout types through the trainer's routine editor.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ clientId: 'cmaria000000000000000001' }),
  useNavigation: () => ({ dispatch: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-crypto', () => {
  let n = 9000;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

const HINT =
  'Maria chose “Keep it simple”: they tick exercises off instead of logging weights. Only Maria can change this.';

const ticked = (overrides: Partial<CoachedExerciseDto> = {}): CoachedExerciseDto => ({
  exerciseId: 'squat',
  name: 'Back Squat',
  skipped: false,
  lastSetRir: 2,
  sets: [
    { weightKg: 80, reps: 5, isWarmup: false, completed: true },
    { weightKg: 80, reps: 5, isWarmup: false, completed: true },
    { weightKg: 80, reps: 5, isWarmup: false, completed: true },
  ],
  doneAsPlanned: true,
  ...overrides,
});

function clientHandlers(opts: { keepItSimple: boolean }, overrides = {}) {
  return trainerHandlers({
    'trainer.clients.list': () => [clientRow({ keepItSimple: opts.keepItSimple })],
    'trainer.client.overview': () => ({
      client: {
        name: 'Maria Pop',
        since: '2026-09-20T09:00:00.000Z',
        keepItSimple: opts.keepItSimple,
      },
      adherence: adherence(),
      recent: [],
    }),
    'trainer.client.workouts': () => ({ items: [workout()], nextCursor: null }),
    'trainer.client.note': () => null,
    ...overrides,
  });
}

describe('the "Keep it simple" badge', () => {
  it('home: a Keep it simple client wears the badge (and says so to a screen reader); others do not', async () => {
    await renderWithTrpc(
      <TrainerHomeRoute />,
      trainerHandlers({
        'trainer.clients.list': () => [
          clientRow({ keepItSimple: true }),
          clientRow({ clientId: 'cion00000000000000000002', name: 'Ion Vasile' }),
        ],
      }),
    );
    await settle();
    expect(screen.getByTestId(`trainer-client-${MARIA}-keep-it-simple`)).toHaveTextContent(
      'Keep it simple',
    );
    expect(screen.getByTestId(`trainer-client-${MARIA}`)).toHaveAccessibleName(
      /\. Keep it simple$/,
    );
    expect(
      screen.queryByTestId('trainer-client-cion00000000000000000002-keep-it-simple'),
    ).toBeNull();
  });

  it('client screen: the header badge and the hint, and no control to change the training style', async () => {
    await renderWithTrpc(<TrainerClientRoute />, clientHandlers({ keepItSimple: true }));
    await settle();
    expect(screen.getByTestId('trainer-client-keep-it-simple')).toHaveTextContent('Keep it simple');
    expect(screen.getByTestId('trainer-client-keep-it-simple-hint')).toHaveTextContent(HINT);
    // The style is the client's: nothing here offers to change it.
    expect(screen.queryByText(/Track my progress/)).toBeNull();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByText(/training style/i)).toBeNull();
  });

  it('client screen: no badge or hint for a client who tracks their progress', async () => {
    await renderWithTrpc(<TrainerClientRoute />, clientHandlers({ keepItSimple: false }));
    await settle();
    expect(screen.queryByTestId('trainer-client-keep-it-simple')).toBeNull();
    expect(screen.queryByTestId('trainer-client-keep-it-simple-hint')).toBeNull();
  });
});

describe('Workouts of a Keep it simple client', () => {
  it('a ticked exercise reads "Done as planned" with its set count and never its weights or reps', async () => {
    await renderWithTrpc(
      <TrainerClientRoute />,
      clientHandlers(
        { keepItSimple: true },
        {
          'trainer.client.workouts': () => ({
            items: [
              workout({
                exercises: [
                  ticked(),
                  {
                    exerciseId: 'bench',
                    name: 'Barbell Bench Press',
                    skipped: false,
                    lastSetRir: 1,
                    sets: [{ weightKg: 62.5, reps: 6, isWarmup: false, completed: true }],
                  },
                ],
              }),
            ],
            nextCursor: null,
          }),
        },
      ),
    );
    await settle();
    const card = screen.getByTestId('trainer-workout-w1');
    expect(screen.getByTestId('trainer-workout-w1-squat-done-as-planned')).toHaveTextContent(
      'Done as planned · 3 sets',
    );
    expect(screen.queryByTestId('trainer-workout-w1-squat-sets')).toBeNull();
    expect(screen.getByTestId('trainer-workout-w1-squat')).not.toHaveTextContent(/80|kg|×/);
    expect(screen.getByTestId('trainer-workout-w1-squat')).not.toHaveTextContent(/reserve/);
    // A logged exercise next to it still shows what was lifted.
    expect(screen.getByTestId('trainer-workout-w1-bench-sets')).toHaveTextContent('62.5 kg × 6');
    expect(card).not.toHaveTextContent(/kcal|calorie/i);
  });

  it('a typed workout with no exercises reads "Yoga · 45 min"; without a duration just "Yoga"', async () => {
    await renderWithTrpc(
      <TrainerClientRoute />,
      clientHandlers(
        { keepItSimple: true },
        {
          'trainer.client.workouts': () => ({
            items: [
              workout({
                id: 'y1',
                name: 'Yoga',
                durationMin: 45,
                workoutType: 'YOGA',
                exercises: [],
              }),
              workout({
                id: 'y2',
                name: 'Swim',
                localDate: '2026-09-28',
                durationMin: null,
                workoutType: 'SWIMMING',
                exercises: [],
              }),
            ],
            nextCursor: null,
          }),
        },
      ),
    );
    await settle();
    expect(screen.getByTestId('trainer-workout-y1-type')).toHaveTextContent('Yoga · 45 min');
    expect(screen.getByTestId('trainer-workout-y1-when')).toHaveTextContent('Wed 30 Sep');
    expect(screen.getByTestId('trainer-workout-y1-when')).not.toHaveTextContent('min');
    expect(screen.getByTestId('trainer-workout-y2-type')).toHaveTextContent('Swimming');
    expect(screen.getByTestId('trainer-workout-y2-type')).not.toHaveTextContent('min');
    expect(screen.getByTestId('trainer-workout-y1')).not.toHaveTextContent(/kcal|calorie/i);
  });

  it('a strength workout keeps its date and duration line', async () => {
    await renderWithTrpc(<TrainerClientRoute />, clientHandlers({ keepItSimple: false }));
    await settle();
    expect(screen.getByTestId('trainer-workout-w1-when')).toHaveTextContent('Wed 30 Sep · 58 min');
    expect(screen.queryByTestId('trainer-workout-w1-type')).toBeNull();
  });
});

describe('format helpers', () => {
  it('doneAsPlannedText: only for ticked exercises; one set reads "1 set"', () => {
    expect(doneAsPlannedText(ticked())).toBe('Done as planned · 3 sets');
    expect(doneAsPlannedText(ticked({ sets: ticked().sets.slice(0, 1) }))).toBe(
      'Done as planned · 1 set',
    );
    expect(doneAsPlannedText(ticked({ sets: [] }))).toBe('Done as planned');
    const { doneAsPlanned: _drop, ...logged } = ticked();
    expect(doneAsPlannedText(logged)).toBeNull();
  });

  it('workoutTypeLine: typed and exercise-free only', () => {
    expect(workoutTypeLine({ workoutType: 'YOGA', durationMin: 45, exercises: [] })).toBe(
      'Yoga · 45 min',
    );
    expect(workoutTypeLine({ workoutType: 'YOGA', durationMin: null, exercises: [] })).toBe('Yoga');
    expect(workoutTypeLine({ workoutType: null, durationMin: 45, exercises: [] })).toBeNull();
    expect(workoutTypeLine({ durationMin: 45, exercises: [] })).toBeNull();
    expect(
      workoutTypeLine({ workoutType: 'UPPER_BODY', durationMin: 45, exercises: [ticked()] }),
    ).toBeNull();
  });
});

// ─── The trainer's routine editor ─────────────────────────────────────────────

const yogaDay: TrainerRoutineDayDto = {
  id: 'd2',
  position: 1,
  name: 'Yoga',
  plannedWeekday: 1,
  workoutType: 'YOGA',
  exercises: [],
};

function typedRoutine(version = 4) {
  const dto = trainerRoutine({ version });
  const upper = dto.days[0];
  if (!upper) throw new Error('fixture');
  return { ...dto, days: [{ ...upper, workoutType: 'UPPER_BODY' as const }, yogaDay] };
}

type SavedDays = {
  routine: {
    days: { id?: string; name: string; workoutType?: string | null; exercises: unknown[] }[];
  };
  expectedVersion: number;
};

function routineHandlers(overrides = {}) {
  return trainerHandlers({
    'trainer.client.routine': () => typedRoutine(),
    'gym.library.list': () => LIBRARY,
    ...overrides,
  });
}

describe('routine editor: My week workout types', () => {
  it('shows each day’s type, and a type-only day says so', async () => {
    await renderWithTrpc(<TrainerRoutineRoute />, routineHandlers());
    await settle();
    expect(screen.getByTestId('trainer-routine-type-d1')).toHaveAccessibleName(
      'Workout type, Upper body',
    );
    expect(screen.queryByTestId('trainer-routine-type-d1-type-only')).toBeNull();
    expect(screen.getByTestId('trainer-routine-type-d2')).toHaveAccessibleName(
      'Workout type, Yoga',
    );
    expect(screen.getByTestId('trainer-routine-type-d2-type-only')).toHaveTextContent(
      'Yoga · no exercises. Maria ticks it off when it’s done.',
    );
  });

  it('a save carries every day’s type and keeps the type-only day', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({ 'trainer.client.saveRoutine': () => typedRoutine(5) }),
    );
    await settle();
    await user.press(screen.getByTestId('routine-editor-day-d1-exercise-e1-toggle'));
    await user.press(screen.getByTestId('routine-editor-day-d1-exercise-e1-sets-inc'));
    await user.press(screen.getByTestId('trainer-routine-save'));
    await settle();
    const sent = r.calls.find((c) => c.path === 'trainer.client.saveRoutine')?.input as SavedDays;
    expect(sent.routine.days).toHaveLength(2);
    expect(sent.routine.days[0]).toMatchObject({ id: 'd1', workoutType: 'UPPER_BODY' });
    expect(sent.routine.days[1]).toEqual({
      id: 'd2',
      name: 'Yoga',
      plannedWeekday: 1,
      workoutType: 'YOGA',
      exercises: [],
    });
    await waitFor(() => expect(screen.queryByTestId('trainer-routine-dirty')).toBeNull());
  });

  it('the trainer changes a type-only day’s type with My week’s picker (renamed like My week does)', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({ 'trainer.client.saveRoutine': () => typedRoutine(5) }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-routine-type-d2'));
    await waitFor(() =>
      expect(screen.getByTestId('trainer-routine-type-picker')).toBeOnTheScreen(),
    );
    await user.press(screen.getByTestId('trainer-routine-type-picker-chips-PILATES'));
    await settle();
    expect(screen.getByTestId('trainer-routine-type-d2')).toHaveAccessibleName(
      'Workout type, Pilates',
    );
    expect(screen.getByTestId('routine-editor-day-d2-name').props.value).toBe('Pilates');
    expect(screen.getByTestId('trainer-routine-dirty')).toBeTruthy();
    await user.press(screen.getByTestId('trainer-routine-save'));
    await settle();
    const sent = r.calls.find((c) => c.path === 'trainer.client.saveRoutine')?.input as SavedDays;
    expect(sent.routine.days[1]).toMatchObject({
      id: 'd2',
      name: 'Pilates',
      workoutType: 'PILATES',
      exercises: [],
    });
  });

  it('a day with exercises gets a type without being renamed, and "No type" clears it', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({ 'trainer.client.saveRoutine': () => typedRoutine(5) }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-routine-type-d1'));
    await waitFor(() =>
      expect(screen.getByTestId('trainer-routine-type-picker')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('trainer-routine-type-picker-chips-REST')).toHaveTextContent(
      'No type',
    );
    await user.press(screen.getByTestId('trainer-routine-type-picker-chips-REST'));
    await settle();
    expect(screen.getByTestId('trainer-routine-type-d1')).toHaveAccessibleName(
      'Workout type, No type',
    );
    expect(screen.getByTestId('routine-editor-day-d1-name').props.value).toBe('Upper');
    await user.press(screen.getByTestId('trainer-routine-save'));
    await settle();
    const sent = r.calls.find((c) => c.path === 'trainer.client.saveRoutine')?.input as SavedDays;
    expect(sent.routine.days[0]).toMatchObject({ id: 'd1', name: 'Upper', workoutType: null });
  });

  it('a conflict still names the client; Use the other version keeps the client’s types', async () => {
    let attempts = 0;
    const current = {
      id: 'r1',
      name: 'Maria routine',
      templateKey: null,
      isActive: true,
      nextDayId: 'd1',
      version: 6,
      archived: false,
      updatedAt: '2026-10-04T08:00:00.000Z',
      lastEditedByOther: { name: 'Maria', at: '2026-10-04T08:00:00.000Z' },
      days: [
        {
          id: 'd2',
          position: 0,
          name: 'Swimming',
          plannedWeekday: 2,
          workoutType: 'SWIMMING',
          exercises: [],
        },
      ],
    };
    await renderWithTrpc(
      <TrainerRoutineRoute />,
      routineHandlers({
        'trainer.client.saveRoutine': () => {
          attempts += 1;
          throw trpcError('CONFLICT', 409, { conflict: { kind: 'routine', current } });
        },
      }),
    );
    await settle();
    const user = userEvent.setup();
    await user.press(screen.getByTestId('trainer-routine-type-d2'));
    await waitFor(() =>
      expect(screen.getByTestId('trainer-routine-type-picker')).toBeOnTheScreen(),
    );
    await user.press(screen.getByTestId('trainer-routine-type-picker-chips-HIIT'));
    await settle();
    await user.press(screen.getByTestId('trainer-routine-save'));
    await settle();
    expect(attempts).toBe(1);
    expect(screen.getByTestId('trainer-routine-conflict-message')).toHaveTextContent(
      /^Maria changed this routine while you were editing\./,
    );
    await user.press(screen.getByTestId('trainer-routine-conflict-use-theirs'));
    await settle();
    expect(screen.getByTestId('trainer-routine-type-d2')).toHaveAccessibleName(
      'Workout type, Swimming',
    );
  });
});

describe('routine draft mapping and reducer', () => {
  it('an older payload without types saves without them (the server keeps what it has)', () => {
    const doc = draftToTrainerRoutineDoc(trainerRoutineToDraft(trainerRoutine()));
    expect(doc.days[0]).not.toHaveProperty('workoutType');
  });

  it('routineDtoToDraft (the client’s own editor) carries a type but adds no key when absent', () => {
    const draft = routineDtoToDraft({
      id: 'r1',
      name: 'Mine',
      templateKey: null,
      isActive: true,
      nextDayId: null,
      version: 1,
      archived: false,
      updatedAt: '2026-10-04T08:00:00.000Z',
      days: [
        {
          id: 'a',
          position: 0,
          name: 'Yoga',
          plannedWeekday: 0,
          workoutType: 'YOGA',
          exercises: [],
        },
        { id: 'b', position: 1, name: 'Push', plannedWeekday: null, exercises: [] },
      ],
    });
    expect(draft.days[0]?.workoutType).toBe('YOGA');
    expect(draft.days[1]).not.toHaveProperty('workoutType');
  });

  it('duplicating a typed day keeps its type', () => {
    const draft = trainerRoutineToDraft(typedRoutine());
    const next = routineDraftReducer(draft, {
      type: 'duplicateDay',
      dayKey: 'd2',
      dayId: 'd3',
      exerciseIds: [],
    });
    expect(next.days[2]).toMatchObject({ key: 'd3', name: 'Yoga (copy)', workoutType: 'YOGA' });
  });
});
