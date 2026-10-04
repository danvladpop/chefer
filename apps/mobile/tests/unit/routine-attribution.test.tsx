import { useReducer } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { COACHING_LIMITS, type RoutineDto, type TrainerRoutineDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { ExercisePicker } from '../../src/features/gym/library/exercise-picker';
import { formatStampDate } from '../../src/features/gym/routine/attribution';
import { RoutineConflictSheet } from '../../src/features/gym/routine/conflict-sheet';
import { DayEditor, type DayEditorCoaching } from '../../src/features/gym/routine/day-editor';
import {
  draftToRoutineDoc,
  draftToTrainerRoutineDoc,
  removedTrainerNoteIds,
  routineDtoToDraft,
  trainerRoutineToDraft,
} from '../../src/features/gym/routine/mapping';
import { routineDraftReducer } from '../../src/features/gym/routine/reducer';
import type { RoutineDraft } from '../../src/features/gym/routine/types';
import { makeExercise } from './gym-fixtures';
import { safeAreaMetrics } from './gym-workout-helpers';

// WP-18 lane C seams: the shared routine-editor additions the trainer's editor and the client's
// screens reuse (spec §2.5, §2.6, §5.3, §9.1). The owner's plain editor is covered by
// gym-routine-day-editor.test.tsx and must not change.

jest.mock('expo-crypto', () => {
  let n = 5000;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const library = new Map([
  ['bench', makeExercise('bench', 'Barbell Bench Press')],
  ['row', makeExercise('row', 'Barbell Row')],
]);

function slot(id: string, exerciseId: string, position: number, extra = {}) {
  return {
    id,
    exerciseId,
    position,
    sets: 4,
    repMin: 6,
    repMax: 8,
    targetRir: 2,
    restSec: 180,
    supersetGroup: null,
    notes: null,
    ...extra,
  };
}

function dto(): RoutineDto {
  return {
    id: 'r1',
    name: 'Mine',
    templateKey: null,
    isActive: true,
    nextDayId: null,
    version: 3,
    archived: false,
    updatedAt: '2026-10-02T09:00:00.000Z',
    lastEditedByOther: { name: 'Ana', at: '2026-10-02T09:00:00.000Z' },
    days: [
      {
        id: 'd1',
        position: 0,
        name: 'Upper',
        plannedWeekday: null,
        exercises: [
          slot('e1', 'bench', 0, {
            trainerNote: 'Knees out, slow eccentric',
            lastEditedByOther: { name: 'Ana', at: '2026-10-02T09:00:00.000Z' },
          }),
          slot('e2', 'row', 1),
        ],
      },
    ],
  };
}

function trainerDto(): TrainerRoutineDto {
  return {
    id: 'r1',
    name: 'Maria routine',
    templateKey: null,
    version: 4,
    nextDayId: 'd1',
    updatedAt: '2026-10-03T09:00:00.000Z',
    lastEditedByOther: { name: 'Maria', at: '2026-10-03T09:00:00.000Z' },
    days: [
      {
        id: 'd1',
        position: 0,
        name: 'Upper',
        plannedWeekday: 1,
        exercises: [
          {
            id: 'e1',
            exerciseId: 'bench',
            position: 0,
            sets: 4,
            repMin: 6,
            repMax: 8,
            targetRir: 2,
            restSec: 180,
            supersetGroup: null,
            trainerNote: 'Pause on chest',
            lastEditedByOther: { name: 'Maria', at: '2026-10-03T09:00:00.000Z' },
            next: null,
          },
          {
            id: 'e2',
            exerciseId: 'row',
            position: 1,
            sets: 3,
            repMin: 10,
            repMax: 12,
            targetRir: 1,
            restSec: 90,
            supersetGroup: null,
            trainerNote: null,
            lastEditedByOther: null,
            next: null,
          },
        ],
      },
    ],
    exercises: [],
  };
}

let latest: RoutineDraft | null = null;

function Harness({
  initial,
  coaching,
}: {
  initial: RoutineDraft;
  coaching: DayEditorCoaching | undefined;
}) {
  const [draft, dispatch] = useReducer(routineDraftReducer, initial);
  latest = draft;
  const day = draft.days[0];
  if (!day) return null;
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <DayEditor
        day={day}
        index={0}
        dayCount={1}
        lookup={(id) => library.get(id)}
        dispatch={dispatch}
        onAddExercise={jest.fn()}
        onSwapExercise={jest.fn()}
        coaching={coaching}
      />
    </SafeAreaProvider>
  );
}

const row = (key: string) => `routine-editor-day-d1-exercise-${key}`;

beforeEach(() => {
  latest = null;
  resetSnackbarForTests();
});

describe('mapping', () => {
  it('carries trainer notes and stamps from a level-6 routine, and nothing from a level-4 one', () => {
    const draft = routineDtoToDraft(dto());
    expect(draft.lastEditedByOther).toEqual({ name: 'Ana', at: '2026-10-02T09:00:00.000Z' });
    expect(draft.days[0]?.exercises[0]).toMatchObject({
      trainerNote: 'Knees out, slow eccentric',
      lastEditedByOther: { name: 'Ana' },
    });
    expect(draft.days[0]?.exercises[1]).not.toHaveProperty('trainerNote');
    expect(draft.days[0]?.exercises[1]).not.toHaveProperty('lastEditedByOther');
  });

  it('the owner save never sends trainerNote or the stamps (a full-document save keeps them server-side)', () => {
    const doc = draftToRoutineDoc(routineDtoToDraft(dto()));
    expect(JSON.stringify(doc)).not.toContain('trainerNote');
    expect(JSON.stringify(doc)).not.toContain('lastEditedByOther');
  });

  it('the trainer draft has no client notes; the trainer save sends trainerNote and no notes', () => {
    const draft = trainerRoutineToDraft(trainerDto());
    expect(draft.days[0]?.exercises[0]).toMatchObject({
      notes: null,
      trainerNote: 'Pause on chest',
    });
    const doc = draftToTrainerRoutineDoc(draft);
    const rows = doc.days[0]?.exercises ?? [];
    expect(rows[0]).toMatchObject({ id: 'e1', trainerNote: 'Pause on chest' });
    expect(rows[1]).toMatchObject({ id: 'e2', trainerNote: null });
    expect(JSON.stringify(doc)).not.toContain('"notes"');
  });

  it('removedTrainerNoteIds lists only saved rows whose note was removed', () => {
    const baseline = routineDtoToDraft(dto());
    const next = routineDraftReducer(baseline, {
      type: 'setTrainerNote',
      dayKey: 'd1',
      exerciseKey: 'e1',
      note: null,
    });
    expect(removedTrainerNoteIds(baseline, next)).toEqual(['e1']);
    expect(removedTrainerNoteIds(baseline, baseline)).toEqual([]);
  });
});

describe('reducer', () => {
  it('setTrainerNote clamps to the limit and turns an empty note into null', () => {
    const base = trainerRoutineToDraft(trainerDto());
    const long = 'x'.repeat(COACHING_LIMITS.trainerNoteMaxChars + 20);
    const a = routineDraftReducer(base, {
      type: 'setTrainerNote',
      dayKey: 'd1',
      exerciseKey: 'e2',
      note: long,
    });
    expect(a.days[0]?.exercises[1]?.trainerNote).toHaveLength(COACHING_LIMITS.trainerNoteMaxChars);
    const b = routineDraftReducer(a, {
      type: 'setTrainerNote',
      dayKey: 'd1',
      exerciseKey: 'e2',
      note: '',
    });
    expect(b.days[0]?.exercises[1]?.trainerNote).toBeNull();
  });

  it('a duplicated day copy drops the original rows’ "changed by" stamps', () => {
    const base = routineDtoToDraft(dto());
    const next = routineDraftReducer(base, {
      type: 'duplicateDay',
      dayKey: 'd1',
      dayId: 'copy',
      exerciseIds: ['c1', 'c2'],
    });
    expect(next.days[1]?.exercises[0]).not.toHaveProperty('lastEditedByOther');
    expect(next.days[1]?.exercises[0]?.id).toBeUndefined();
  });
});

describe('formatStampDate', () => {
  it('formats a date-only string and an ISO date-time as "2 Oct"', () => {
    expect(formatStampDate('2026-10-02')).toBe('2 Oct');
    expect(formatStampDate('2026-10-02T12:00:00.000Z')).toBe('2 Oct');
    expect(formatStampDate('nope')).toBe('');
  });
});

describe('DayEditor, client role', () => {
  it('shows "Changed by Ana" and the trainer note on the changed row only; Remove note clears it', async () => {
    const user = userEvent.setup();
    await render(
      <Harness
        initial={routineDtoToDraft(dto())}
        coaching={{ role: 'client', trainerName: 'Ana' }}
      />,
    );
    expect(screen.getByTestId(`${row('e1')}-changed-by`)).toHaveTextContent(
      /^Changed by Ana · 2 Oct$/,
    );
    expect(screen.getByTestId(`${row('e1')}-trainer-note`)).toHaveTextContent(
      'Ana: Knees out, slow eccentric',
    );
    expect(screen.queryByTestId(`${row('e2')}-changed-by`)).toBeNull();
    expect(screen.queryByTestId(`${row('e2')}-trainer-note`)).toBeNull();
    // The client cannot rewrite the note: no note input in the client's editor.
    await user.press(screen.getByTestId(`${row('e1')}-toggle`));
    expect(screen.queryByTestId(`${row('e1')}-trainer-note-input`)).toBeNull();

    await user.press(screen.getByTestId(`${row('e1')}-trainer-note-remove`));
    expect(screen.queryByTestId(`${row('e1')}-trainer-note`)).toBeNull();
    expect(latest?.days[0]?.exercises[0]?.trainerNote).toBeNull();
  });

  it('an uncoached editor (no coaching prop) renders no coaching lines', async () => {
    const plain = dto();
    delete plain.lastEditedByOther;
    await render(<Harness initial={routineDtoToDraft(plain)} coaching={undefined} />);
    expect(screen.queryByTestId(`${row('e2')}-changed-by`)).toBeNull();
    expect(screen.queryByTestId(`${row('e2')}-trainer-note-remove`)).toBeNull();
  });
});

describe('DayEditor, trainer role', () => {
  it('has a labelled "Note for Maria" field limited to 200 characters and a live counter', async () => {
    const user = userEvent.setup();
    await render(
      <Harness
        initial={trainerRoutineToDraft(trainerDto())}
        coaching={{ role: 'trainer', clientName: 'Maria' }}
      />,
    );
    await user.press(screen.getByTestId(`${row('e2')}-toggle`));
    const input = screen.getByTestId(`${row('e2')}-trainer-note-input`);
    expect(input.props.accessibilityLabel).toBe('Note for Maria');
    expect(input.props.maxLength).toBe(COACHING_LIMITS.trainerNoteMaxChars);
    await fireEvent.changeText(input, 'Slow down on the way up');
    expect(latest?.days[0]?.exercises[1]?.trainerNote).toBe('Slow down on the way up');
    expect(screen.getByText('Maria will see this note under the exercise.')).toBeTruthy();
    expect(screen.getByText(`23 / ${COACHING_LIMITS.trainerNoteMaxChars}`)).toBeTruthy();
  });

  it('shows "Changed by Maria" on the row the client changed and renders the next-session slot', async () => {
    await render(
      <Harness
        initial={trainerRoutineToDraft(trainerDto())}
        coaching={{
          role: 'trainer',
          clientName: 'Maria',
          renderNext: (ex) => <NextProbe id={ex.id ?? ex.key} />,
        }}
      />,
    );
    expect(screen.getByTestId(`${row('e1')}-changed-by`)).toHaveTextContent(
      /^Changed by Maria · 3 Oct$/,
    );
    expect(screen.queryByTestId(`${row('e2')}-changed-by`)).toBeNull();
    expect(screen.getByTestId('next-probe-e1')).toBeTruthy();
    expect(screen.getByTestId('next-probe-e2')).toBeTruthy();
  });
});

function NextProbe({ id }: { id: string }) {
  // Tiny stand-in for the trainer's next-session line.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest hoisting keeps RN imports lazy here
  const { Text } = require('react-native') as typeof import('react-native');
  return <Text testID={`next-probe-${id}`}>next</Text>;
}

describe('RoutineConflictSheet', () => {
  function sheet(current: RoutineDto | null) {
    const onKeepMine = jest.fn();
    const onUseTheirs = jest.fn();
    return {
      onKeepMine,
      onUseTheirs,
      ui: (
        <SafeAreaProvider initialMetrics={safeAreaMetrics}>
          <RoutineConflictSheet
            current={current}
            onClose={jest.fn()}
            onKeepMine={onKeepMine}
            onUseTheirs={onUseTheirs}
          />
        </SafeAreaProvider>
      ),
    };
  }

  it('names the other person and offers both choices', async () => {
    const user = userEvent.setup();
    const current = dto();
    const s = sheet(current);
    await render(s.ui);
    expect(screen.getByTestId('gym-routine-editor-conflict-message')).toHaveTextContent(
      /^Ana changed this routine while you were editing\. /,
    );
    await user.press(screen.getByTestId('gym-routine-editor-conflict-keep-mine'));
    expect(s.onKeepMine).toHaveBeenCalledWith(current);
    await user.press(screen.getByTestId('gym-routine-editor-conflict-use-theirs'));
    expect(s.onUseTheirs).toHaveBeenCalledWith(current);
  });

  it('keeps the generic copy when the server names nobody (older API)', async () => {
    const plain = dto();
    delete plain.lastEditedByOther;
    await render(sheet(plain).ui);
    expect(screen.getByTestId('gym-routine-editor-conflict-message')).toHaveTextContent(
      /^This routine changed on another device\. /,
    );
  });
});

describe('ExercisePicker curatedOnly', () => {
  const lib = [
    makeExercise('bench', 'Barbell Bench Press'),
    { ...makeExercise('mine', 'My Secret Lift'), ownerId: 'u1' },
  ];

  it('hides custom exercises and says why; the default picker still lists them', async () => {
    const { rerender } = await render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <ExercisePicker visible onClose={jest.fn()} onPick={jest.fn()} library={lib} curatedOnly />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Barbell Bench Press')).toBeTruthy();
    expect(screen.queryByText('My Secret Lift')).toBeNull();
    expect(screen.getByTestId('exercise-picker-curated-only')).toBeTruthy();

    await rerender(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <ExercisePicker visible onClose={jest.fn()} onPick={jest.fn()} library={lib} />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('My Secret Lift')).toBeTruthy();
    expect(screen.queryByTestId('exercise-picker-curated-only')).toBeNull();
  });
});
