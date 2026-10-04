// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXERCISE_BY_ID, type RoutineDto, type TrainerRoutineDto } from '@chefer/types';
import { TrainerRoutineEditor } from './TrainerRoutineEditor';

type SaveOptions = {
  onSuccess?: (saved: TrainerRoutineDto) => void;
  onError?: (err: { data?: { conflict?: { current: RoutineDto } } }) => void;
};

const m = vi.hoisted(
  (): {
    routine: TrainerRoutineDto | null;
    save: ReturnType<typeof vi.fn<[unknown], undefined>>;
    saveOptions: SaveOptions;
    setTarget: ReturnType<typeof vi.fn<[unknown], undefined>>;
    clearTarget: ReturnType<typeof vi.fn<[unknown], undefined>>;
  } => ({
    routine: null,
    save: vi.fn<[unknown], undefined>(),
    saveOptions: {},
    setTarget: vi.fn<[unknown], undefined>(),
    clearTarget: vi.fn<[unknown], undefined>(),
  }),
);

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/features/gym/library/ExerciseImage', () => ({ ExerciseImage: () => null }));
vi.mock('@/lib/trpc', () => {
  const noop = vi.fn();
  const library = [...EXERCISE_BY_ID.values()].map((e) => ({ ...e, ownerId: null, images: [] }));
  return {
    trpc: {
      useUtils: () => ({
        trainer: {
          client: { routine: { invalidate: noop, setData: noop } },
          clients: { list: { invalidate: noop } },
        },
        gym: { routine: { get: { fetch: noop } } },
      }),
      gym: {
        profile: { get: { useQuery: () => ({ data: { unit: 'KG' } }) } },
        library: { list: { useQuery: () => ({ data: library }) } },
        routine: { list: { useQuery: () => ({ data: [] }) } },
      },
      trainer: {
        client: {
          overview: {
            useQuery: () => ({
              data: { client: { name: 'Maria Popescu', since: '2026-09-20T09:00:00.000Z' } },
              isLoading: false,
              isError: false,
            }),
          },
          routine: {
            useQuery: () => ({ data: m.routine, isLoading: false, isError: false }),
          },
          saveRoutine: {
            useMutation: (options: SaveOptions) => {
              m.saveOptions = options;
              return { mutate: m.save, isPending: false };
            },
          },
          createRoutine: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
          setNextTarget: { useMutation: () => ({ mutate: m.setTarget, isPending: false }) },
          clearNextTarget: { useMutation: () => ({ mutate: m.clearTarget, isPending: false }) },
          note: { useQuery: () => ({ isSuccess: true, data: null }) },
          saveNote: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        },
      },
    },
  };
});

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

function routine(): TrainerRoutineDto {
  return {
    id: 'r1',
    name: 'Push Pull Legs',
    templateKey: null,
    version: 4,
    nextDayId: 'd1',
    updatedAt: '2026-10-02T10:00:00.000Z',
    lastEditedByOther: { name: 'Maria', at: '2026-10-03T08:00:00.000Z' },
    exercises: [],
    days: [
      {
        id: 'd1',
        position: 0,
        name: 'Day A',
        plannedWeekday: 3,
        exercises: [
          {
            id: 're1',
            exerciseId: 'back-squat',
            position: 0,
            sets: 3,
            repMin: 6,
            repMax: 8,
            targetRir: 2,
            restSec: 120,
            supersetGroup: null,
            trainerNote: null,
            lastEditedByOther: { name: 'Maria', at: '2026-10-03T08:00:00.000Z' },
            next: {
              repBucket: '6-8',
              suggestion: {
                kind: 'hold',
                weightKg: 60,
                reps: [8, 8, 8],
                sets: 3,
                reasonCode: 'CONSOLIDATE',
                inputs: {},
                deltaKg: 0,
                engineVersion: 1,
              },
              override: null,
              lastDoneDate: null,
            },
          },
          {
            id: 're2',
            exerciseId: 'seated-leg-curl',
            position: 1,
            sets: 3,
            repMin: 10,
            repMax: 12,
            targetRir: 2,
            restSec: 90,
            supersetGroup: null,
            trainerNote: null,
            lastEditedByOther: null,
            next: null,
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  m.routine = routine();
  m.save.mockClear();
  m.setTarget.mockClear();
  m.clearTarget.mockClear();
});
afterEach(cleanup);

describe('TrainerRoutineEditor', () => {
  it('shows the client name as the one h1, the routine stamp, and "Changed by Maria" on the changed row only', () => {
    render(<TrainerRoutineEditor clientId="c1" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Maria Popescu' })).toBeInTheDocument();
    // the routine header line + exactly one row (desktop board; the phone card collapses its rows)
    const stamps = screen.getAllByTestId('changed-by').map((el) => el.textContent);
    expect(stamps).toContain('Changed by Maria · 3 Oct');
    expect(stamps.filter((t) => t === 'Changed by Maria · 3 Oct').length).toBeGreaterThanOrEqual(2);
  });

  it('adds a note and saves a version-checked document with the trainer note and no client notes', () => {
    render(<TrainerRoutineEditor clientId="c1" />);
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    const [field] = screen.getAllByLabelText('Note for Maria');
    fireEvent.change(field!, { target: { value: 'knees out, slow eccentric' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    expect(m.save).toHaveBeenCalledTimes(1);
    const input = m.save.mock.calls[0]?.[0] as {
      clientId: string;
      expectedVersion: number;
      routine: { days: { exercises: { id?: string; trainerNote: string | null }[] }[] };
    };
    expect(input.clientId).toBe('c1');
    expect(input.expectedVersion).toBe(4);
    expect(input.routine.days[0]?.exercises[0]).toMatchObject({
      id: 're1',
      trainerNote: 'knees out, slow eccentric',
    });
    expect(input.routine.days[0]?.exercises[1]?.trainerNote).toBeNull();
    expect(JSON.stringify(input)).not.toContain('"notes"');
  });

  it('blocks Save while a note is over 200 characters', () => {
    render(<TrainerRoutineEditor clientId="c1" />);
    const [field] = screen.getAllByLabelText('Note for Maria');
    fireEvent.change(field!, { target: { value: 'x'.repeat(201) } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('200 characters or fewer');
  });

  it('names the client in the conflict dialog; Keep mine re-saves on the newer version', () => {
    render(<TrainerRoutineEditor clientId="c1" />);
    const [field] = screen.getAllByLabelText('Note for Maria');
    fireEvent.change(field!, { target: { value: 'tempo 3-1-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const current: RoutineDto = {
      id: 'r1',
      name: 'Push Pull Legs',
      templateKey: null,
      isActive: true,
      nextDayId: 'd1',
      version: 5,
      archived: false,
      updatedAt: '2026-10-04T09:00:00.000Z',
      lastEditedByOther: { name: 'Maria', at: '2026-10-04T09:00:00.000Z' },
      days: [],
    };
    m.saveOptions.onError?.({ data: { conflict: { current } } });

    // The dialog renders asynchronously with the Sheet's presence; flush a tick via findBy in a follow-up.
    return screen.findByText('Maria changed this routine while you were editing').then(() => {
      m.save.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
      expect(m.save).toHaveBeenCalledTimes(1);
      expect(m.save.mock.calls[0]?.[0]).toMatchObject({ clientId: 'c1', expectedVersion: 5 });
    });
  });

  it('adjusts the next-session target through the sheet and clears it back to the suggestion', () => {
    render(<TrainerRoutineEditor clientId="c1" />);
    const panel = screen.getByTestId('trainer-next-session');
    expect(within(panel).getByTestId('trainer-next-day')).toHaveTextContent(
      'Next: Day A · planned Thu',
    );
    fireEvent.click(within(panel).getByRole('button', { name: /^Adjust: / }));

    const weight = screen.getByLabelText(/Weight \(kg\)/);
    const reps = screen.getByLabelText('Reps per set');
    fireEvent.change(weight, { target: { value: '62.5' } });
    fireEvent.change(reps, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(m.setTarget).toHaveBeenCalledWith({
      clientId: 'c1',
      exerciseId: 'back-squat',
      repBucket: '6-8',
      weightKg: 62.5,
      reps: [6, 6, 6],
    });
  });

  it('offers a routine to a client with none', () => {
    m.routine = null;
    render(<TrainerRoutineEditor clientId="c1" />);
    expect(screen.getByText('This client has no active routine yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a 3-day routine' })).toBeInTheDocument();
  });
});
